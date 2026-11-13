"""The orchestrator. Lesson planning runs as a LangGraph graph (orchestration/graph.py); re-plans, re-checks,
feedback and learner help reuse the same agents and shared steps here."""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

from agents.adaptation_designer import AdaptationDesigner
from agents.base import AgentOutputError
from agents.language_agent import LanguageAgent
from agents.lesson_analyst import LessonAnalyst
from agents.orchestrator_agents import Planner, Router
from agents.needs_matcher import NeedsMatcher
from agents.pack_builder import PackBuilder
from agents.personalisation_agent import PersonalisationAgent
from agents.progress_tracker import ProgressTracker
from agents.reviewer import ReviewOutcome, Reviewer
from config import Settings
from llm.client import LLMClient, LLMError
from models.schemas import (
    WHOLE_CLASS, Adaptation, ClassroomConstraints, DraftAdaptation, ExplainRequest, FeedbackRequest,
    LearnerMaterial, LearnerProfile, LessonAnalysis, LessonRequest, NeedsMatch, RecheckRequest, ReplanRequest,
    language_name,
)
from orchestration.events import RunTrace
from orchestration.graph import build_graph, graph_structure
from storage.database import Store
from tools.safety_tools import find_labels, redact_labels
from tools.validation_tools import check_material, rebalance_flow

ORCHESTRATOR = "Orchestrator"
# On a serverless host, translation (a slow, large model) only starts with at least this long left in the run.
TRANSLATION_MIN_SECONDS = 60


@dataclass
class DesignResult:
    adaptations: list[Adaptation]
    review: ReviewOutcome
    attempts: int
    corrections: int
    unresolved: dict[str, list[str]] = field(default_factory=dict)


class Orchestrator:
    def __init__(self, settings: Settings, store: Store, activity=None):
        self.settings = settings
        self.store = store
        self.activity = activity
        self.analyst = LessonAnalyst()
        self.matcher = NeedsMatcher()
        self.designer = AdaptationDesigner()
        self.reviewer = Reviewer()
        self.personaliser = PersonalisationAgent()
        self.language = LanguageAgent()
        self.packer = PackBuilder()
        self.tracker = ProgressTracker()
        self.planner = Planner()
        self.router = Router()
        self.graph = build_graph(self)

    def graph_structure(self) -> dict:
        return graph_structure(self.graph)

    # ================================================================ full lesson plan

    def plan_lesson(self, trace: RunTrace, llm: LLMClient, req: LessonRequest, owner_id: str | None = None) -> dict:
        try:
            final = self.graph.invoke({"trace": trace, "llm": llm, "req": req, "owner_id": owner_id},
                                      {"recursion_limit": 60})
        finally:
            trace.node = None
        return final["result"]

    # ================================================================ replan after a change

    def replan(self, trace: RunTrace, llm: LLMClient, parent: dict, change: ReplanRequest) -> dict:
        state = parent["result"]["state"]
        old_req = LessonRequest.model_validate(parent["request"])
        new_constraints = change.constraints or old_req.constraints
        req = self._screen(trace, old_req.model_copy(update={"constraints": new_constraints}))
        diffs = describe_constraint_changes(old_req.constraints, new_constraints)
        note = change.teacher_note.strip()

        reasons = diffs + ([f"Teacher's request: \"{note}\""] if note else [])
        trace.emit(ORCHESTRATOR, "plan", "Re-planning because circumstances changed",
                   "Changes: " + "; ".join(reasons) + "\nPlan: keep the lesson analysis, re-check every existing "
                   "adaptation against the new conditions, redesign only what no longer fits, then refresh only the "
                   "learner material affected.",
                   {"changes": reasons, "steps": [
                       {"agent": "Progress Tracker", "action": "Recall feedback, including anything added since the last plan"},
                       {"agent": "Reviewer", "action": "Re-check existing adaptations against the new conditions"},
                       {"agent": "Adaptation Designer", "action": "Redesign only rejected adaptations"},
                       {"agent": "Personalisation Agent", "action": "Refresh learner material that is affected"},
                       {"agent": "Pack Builder", "action": "Rebuild the pack and list what changed"},
                   ]})

        memory = self.tracker.recall(self.store, trace, req, parent.get("owner_id"), self.activity)
        analysis = LessonAnalysis.model_validate(state["analysis"])
        analysis = self._fit_flow(trace, analysis, req.constraints.lesson_minutes)
        needs = NeedsMatch.model_validate(state["needs"])
        before = [Adaptation.model_validate(a) for a in state["adaptations"]]

        design = self._design_loop(trace, llm, req, analysis, needs, memory, current=before, teacher_note=note)
        old_by_id = {a.id: a for a in before}
        changes = []
        for a in design.adaptations:
            old = old_by_id.get(a.id)
            if old is None:
                changes.append({"adaptation_id": a.id, "learner_id": a.learner_id, "before": None,
                                "after": {"strategy": a.strategy, "instruction": a.instruction}})
            elif (old.strategy, old.instruction) != (a.strategy, a.instruction):
                changes.append({"adaptation_id": a.id, "learner_id": a.learner_id,
                                "before": {"strategy": old.strategy, "instruction": old.instruction},
                                "after": {"strategy": a.strategy, "instruction": a.instruction}})
        kept = len(design.adaptations) - len(changes)
        trace.emit(ORCHESTRATOR, "decision", f"{len(changes)} adaptation(s) changed, {kept} kept as they were",
                   "; ".join(f"{c['after']['strategy']}" for c in changes) or "Everything still fits the new conditions.")

        changed_learners = {c["learner_id"] for c in changes}
        old_materials: dict = state.get("materials", {})
        redo: list[LearnerProfile | None] = []
        reused: dict[str, dict] = {}
        for target in [None, *req.learners]:
            key = target.id if target else WHOLE_CLASS
            old = old_materials.get(key)
            stale = (key in changed_learners or old is None or
                     bool(check_material(LearnerMaterial.model_validate(old), req, english=False)))
            if stale:
                redo.append(target)
            else:
                reused[key] = old
        trace.emit(ORCHESTRATOR, "decision",
                   f"Refreshing learner material for {len(redo)} of {len(redo) + len(reused)} audiences",
                   "Reusing material that is unaffected by the change." if reused else "")
        materials, warnings = self._materials(trace, llm, req, analysis, design.adaptations, redo)
        materials.update(reused)

        old_translations: dict = state.get("translations", {})
        redo_ids = {t.id for t in redo if t}
        translations = {k: v for k, v in old_translations.items() if k not in redo_ids}
        to_translate = [l for l in req.learners if l.language != "en" and l.id in redo_ids]
        translations.update(self._translations(trace, llm, req, materials, to_translate))

        return self._finish(trace, req, analysis, needs, design, memory, materials, translations,
                            warnings, changes=changes)

    # ================================================================ teacher-edited plan

    def recheck(self, trace: RunTrace, llm: LLMClient, parent: dict, edit: RecheckRequest) -> dict:
        req = LessonRequest.model_validate(parent["request"])
        analysis = LessonAnalysis.model_validate(parent["result"]["state"]["analysis"])
        trace.emit(ORCHESTRATOR, "plan", "Re-checking the plan you edited",
                   "The Reviewer checks your version. Mothusi will not overwrite your edits; anything it is unsure "
                   "about is flagged for your decision.",
                   {"steps": [{"agent": "Progress Tracker", "action": "Recall feedback"},
                              {"agent": "Reviewer", "action": "Check the edited adaptations"}]})
        memory = self.tracker.recall(self.store, trace, req, parent.get("owner_id"), self.activity)
        outcome = self.reviewer.review_adaptations(llm, trace, req, analysis, edit.adaptations, memory,
                                                   round_label="your edited version")
        if outcome.passed:
            trace.emit(ORCHESTRATOR, "decision", "Your edited plan passed every check", "You can approve it.")
        else:
            trace.emit(ORCHESTRATOR, "decision", f"{len(outcome.issues)} concern(s) flagged for your decision",
                       "You can change the plan again or approve it anyway.")
        return {"passed": outcome.passed, "issues": [i.to_dict() for i in outcome.issues],
                "checks": [c.to_dict() for c in outcome.checks], "warnings": [i.message for i in outcome.issues]}

    # ================================================================ feedback and learner help

    def record_feedback(self, trace: RunTrace, fb: FeedbackRequest, plan_run: dict) -> dict:
        trace.emit(ORCHESTRATOR, "plan", "Recording lesson feedback for future planning",
                   "Progress Tracker stores outcomes per learner and strategy.",
                   {"steps": [{"agent": "Progress Tracker", "action": "Store feedback and decide what to reuse or avoid"}]})
        return self.tracker.record(self.store, trace, fb, plan_run)

    def explain(self, trace: RunTrace, llm: LLMClient, plan_run: dict, ask: ExplainRequest) -> dict:
        req = LessonRequest.model_validate(plan_run["request"])
        state = plan_run["result"]["state"]
        analysis = LessonAnalysis.model_validate(state["analysis"])
        learner = next((l for l in req.learners if ask.learner_id and l.id == ask.learner_id), None)
        language = ask.language
        trace.emit(ORCHESTRATOR, "plan", f"A learner asked for another explanation ({ask.style})",
                   f"For {learner.name if learner else 'a learner in the class'}; language {language_name(language)}",
                   {"steps": [{"agent": "Personalisation Agent", "action": f"Write a {ask.style} explanation"},
                              {"agent": "Reviewer", "action": "Check reading level and conditions"},
                              *([{"agent": "Language Agent", "action": f"Translate into {language_name(language)}"}]
                                if language != "en" else [])]})
        adaptations = [Adaptation.model_validate(a) for a in state["adaptations"]
                       if a["learner_id"] in {WHOLE_CLASS, learner.id if learner else None}]
        material, issues = self._one_material(trace, llm, req, analysis, adaptations, learner, style=ask.style,
                                              interests=ask.interests)
        if material is None:
            raise AgentOutputError("Mothusi could not prepare another explanation right now.")
        result = {"material": material.model_dump(), "language": "en", "translation_status": None}
        if language != "en":
            if not llm.can_translate:
                trace.emit(ORCHESTRATOR, "warning", "Translation is not available in offline mode",
                           "Showing the English version.")
                result["translation_status"] = "unavailable"
            else:
                t = self.language.run(llm, trace, material, language, req.grade, "this learner",
                                      max_attempts=self.settings.max_material_attempts)
                result["translation_status"] = t["status"]
                if t["status"] == "checked":
                    result.update(material=t["material"].model_dump(), language=language)
        return result

    # ================================================================ shared steps

    def _screen(self, trace: RunTrace, req: LessonRequest) -> LessonRequest:
        """Data minimisation: strip diagnostic labels before any agent sees the profiles."""
        found = []
        learners = []
        for l in req.learners:
            labels = find_labels(f"{l.strengths} {l.support}")
            if labels:
                found.append(f"{l.name}: {', '.join(labels)}")
                l = l.model_copy(update={"strengths": redact_labels(l.strengths), "support": redact_labels(l.support)})
            learners.append(l)
        lesson_labels = find_labels(f"{req.objectives} {req.content} {req.constraints.notes}")
        trace.emit(ORCHESTRATOR, "tool", "Privacy and safety screen",
                   f"{len(req.learners)} profile(s) checked. Agents receive only learner labels, strengths, support "
                   "notes and the language the teacher selected.")
        if found or lesson_labels:
            trace.emit(ORCHESTRATOR, "warning", "Removed diagnostic labels before planning",
                       "Mothusi plans from observed strengths and strategies, never from diagnoses. "
                       + "; ".join(found + ([f"lesson text: {', '.join(lesson_labels)}"] if lesson_labels else [])))
            constraints = req.constraints.model_copy(update={"notes": redact_labels(req.constraints.notes)})
            return req.model_copy(update={"learners": learners, "objectives": redact_labels(req.objectives),
                                          "content": redact_labels(req.content), "constraints": constraints})
        return req

    def _fit_flow(self, trace: RunTrace, analysis: LessonAnalysis, minutes: int) -> LessonAnalysis:
        flow, changed = rebalance_flow(analysis.flow, minutes)
        if changed:
            before = sum(p.minutes for p in analysis.flow)
            trace.emit("Reviewer", "tool", f"Lesson flow added up to {before} min; rebalanced to {minutes} min",
                       ", ".join(f"{p.label} {p.minutes}" for p in flow))
            return analysis.model_copy(update={"flow": flow})
        return analysis

    def _design_loop(self, trace: RunTrace, llm: LLMClient, req: LessonRequest, analysis: LessonAnalysis,
                     needs: NeedsMatch, memory: list[dict], *, current: list[Adaptation] | None,
                     teacher_note: str = "") -> DesignResult:
        max_attempts = self.settings.max_design_attempts
        if current is None:
            drafts = self.designer.design(llm, trace, req, analysis, needs, memory, teacher_note)
            adaptations = _with_ids(drafts, [])
            attempts = 1
        else:
            adaptations = list(current)
            attempts = 0
        corrections = 0
        review_round = 1
        while True:
            review = self.reviewer.review_adaptations(
                llm, trace, req, analysis, adaptations, memory,
                round_label=f"round {review_round}", teacher_note=teacher_note,
            )
            if review.passed:
                trace.emit(ORCHESTRATOR, "decision", "Adaptations approved; moving on to learner material",
                           f"Approved after {review_round} review round(s)" +
                           (f" and {corrections} correction(s)" if corrections else ""))
                return DesignResult(adaptations, review, attempts, corrections)
            if attempts >= max_attempts:
                break

            by_id: dict[str, list[str]] = {}
            missing: dict[str, list[str]] = {}
            for issue in review.issues:
                if issue.adaptation_id:
                    by_id.setdefault(issue.adaptation_id, []).append(issue.message)
                elif issue.learner_id:
                    missing.setdefault(issue.learner_id, []).append(issue.message)
            rejected = [(a, a.learner_id, by_id[a.id]) for a in adaptations if a.id in by_id]
            rejected += [(None, lid, msgs) for lid, msgs in missing.items()]
            keep = [a for a in adaptations if a.id not in by_id]
            trace.emit(ORCHESTRATOR, "decision",
                       f"Sending {len(rejected)} item(s) back to the Adaptation Designer; keeping {len(keep)}",
                       "\n".join(f"{(a.strategy if a else lid)}: {msgs[0]}" for a, lid, msgs in rejected),
                       {"rejected": [a.id if a else lid for a, lid, _ in rejected], "kept": [a.id for a in keep]})
            drafts = self.designer.revise(llm, trace, req, analysis, needs, memory, keep, rejected,
                                          attempts + 1, teacher_note)
            adaptations = _merge_revisions(adaptations, rejected, drafts)
            attempts += 1
            corrections += 1
            review_round += 1

        unresolved: dict[str, list[str]] = {}
        for issue in review.issues:
            unresolved.setdefault(issue.adaptation_id or issue.learner_id or "plan", []).append(issue.message)
        trace.emit(ORCHESTRATOR, "warning", f"Stopped after {max_attempts} design attempts",
                   f"{len(review.issues)} concern(s) remain. They are flagged in the pack for your decision rather "
                   "than hidden.", {"unresolved": unresolved})
        return DesignResult(adaptations, review, attempts, corrections, unresolved)

    def _one_material(self, trace: RunTrace, llm: LLMClient, req: LessonRequest, analysis: LessonAnalysis,
                      adaptations: list[Adaptation], learner: LearnerProfile | None,
                      style: str | None = None, interests: list[str] | None = None) -> tuple[LearnerMaterial | None, list[str]]:
        who = learner.name if learner else "the whole class"
        fix: list[str] | None = None
        material = None
        issues: list[str] = []
        for attempt in range(1, self.settings.max_material_attempts + 1):
            try:
                material = self.personaliser.run(llm, trace, req, analysis, learner, adaptations,
                                                 attempt=attempt, fix=fix, style=style, interests=interests)
            except AgentOutputError as exc:
                trace.emit(ORCHESTRATOR, "warning", f"Could not prepare material for {who}", str(exc))
                return None, [str(exc)]
            issues = [i.message for i in self.reviewer.review_material(trace, req, material, who)]
            if not issues:
                return material, []
            if attempt < self.settings.max_material_attempts:
                trace.emit(ORCHESTRATOR, "decision", f"Sending material for {who} back to the Personalisation Agent",
                           " | ".join(issues))
                fix = issues
        return material, issues

    def _materials(self, trace: RunTrace, llm: LLMClient, req: LessonRequest, analysis: LessonAnalysis,
                   adaptations: list[Adaptation], targets: list[LearnerProfile | None]) -> tuple[dict, list[str]]:
        if not targets:
            return {}, []

        def job(target: LearnerProfile | None):
            key = target.id if target else WHOLE_CLASS
            mine = [a for a in adaptations if a.learner_id in {key, WHOLE_CLASS}]
            try:
                return key, *self._one_material(trace, llm, req, analysis, mine, target)
            except LLMError as exc:
                trace.emit(ORCHESTRATOR, "warning", f"Model unavailable while writing material for "
                           f"{target.name if target else 'the whole class'}", str(exc))
                return key, None, [str(exc)]

        materials: dict[str, dict] = {}
        warnings: list[str] = []
        names = {l.id: l.name for l in req.learners}
        with ThreadPoolExecutor(max_workers=4) as pool:
            for key, material, issues in pool.map(job, targets):
                materials[key] = material.model_dump() if material else None
                if issues:
                    who = names.get(key, "the whole class")
                    warnings.append(f"Learner material for {who}: " + "; ".join(issues))
        return materials, warnings

    def _translations(self, trace: RunTrace, llm: LLMClient, req: LessonRequest, materials: dict,
                      learners: list[LearnerProfile]) -> dict:
        learners = [l for l in learners if materials.get(l.id)]
        if not learners:
            return {}
        if trace.remaining() < TRANSLATION_MIN_SECONDS:
            trace.emit(ORCHESTRATOR, "warning", "Translation skipped: not enough time left on this server",
                       "The lesson is ready in English. Learners see English with a note; prepare the lesson again to "
                       "try the translation, or a fluent speaker can provide their language.")
            return {l.id: {"language": l.language, "status": "unavailable", "material": None, "issues": [],
                           "back_translation": ""} for l in learners}
        if not llm.can_translate:
            trace.emit(ORCHESTRATOR, "warning", "Translation skipped in offline demo mode",
                       "The offline model cannot translate. Learners will see English with a note until a live run "
                       "or a fluent speaker provides their language.")
            return {l.id: {"language": l.language, "status": "unavailable", "material": None, "issues": [],
                           "back_translation": ""} for l in learners}

        def job(l: LearnerProfile):
            try:
                return l, self.language.run(llm, trace, LearnerMaterial.model_validate(materials[l.id]), l.language,
                                            req.grade, l.name, max_attempts=self.settings.max_material_attempts)
            except (AgentOutputError, LLMError) as exc:
                trace.emit(ORCHESTRATOR, "warning", f"Translation for {l.name} failed", str(exc))
                return l, {"language": l.language, "status": "failed", "material": None, "issues": [str(exc)],
                           "back_translation": ""}

        out: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=4) as pool:
            for l, t in pool.map(job, learners):
                if t.get("material") is not None and hasattr(t["material"], "model_dump"):
                    t = {**t, "material": t["material"].model_dump()}
                out[l.id] = t
        return out

    def _finish(self, trace: RunTrace, req: LessonRequest, analysis: LessonAnalysis, needs: NeedsMatch,
                design: DesignResult, memory: list[dict], materials: dict, translations: dict,
                extra_warnings: list[str], changes: list[dict]) -> dict:
        warnings = [m for msgs in design.unresolved.values() for m in msgs] + extra_warnings
        for l in req.learners:
            t = translations.get(l.id)
            if l.language != "en" and t and t["status"] != "checked":
                reason = "offline mode cannot translate" if t["status"] == "unavailable" else t["status"].replace("_", " ")
                warnings.append(f"{l.name}'s {language_name(l.language)} material is not ready ({reason}). "
                                "Learners see English until it is.")
        stats = {
            "design_attempts": design.attempts,
            "corrections": design.corrections,
            "rejections": trace.count("check_failed"),
            "repairs": trace.count("repair"),
            "elapsed_ms": trace.elapsed_ms(),
        }
        pack = self.packer.build(trace, req=req, analysis=analysis, needs=needs, adaptations=design.adaptations,
                                 materials=materials, translations=translations, checks=design.review.checks,
                                 warnings=warnings, memory=memory, stats=stats)
        return {
            "pack": pack,
            "changes": changes,
            "unresolved": design.unresolved,
            "warnings": warnings,
            "state": {
                "analysis": analysis.model_dump(),
                "needs": needs.model_dump(),
                "adaptations": [a.model_dump() for a in design.adaptations],
                "materials": materials,
                "translations": translations,
            },
        }


def describe_constraint_changes(old: ClassroomConstraints, new: ClassroomConstraints) -> list[str]:
    out = []
    if old.noisy_venue != new.noisy_venue:
        out.append("the lesson is now in a noisy venue" if new.noisy_venue else "the lesson is back in a quiet room")
    if old.has_printer != new.has_printer:
        out.append("a printer is now available" if new.has_printer else "the printer is no longer available")
    if old.has_devices != new.has_devices:
        out.append("learner devices are now available" if new.has_devices else "learner devices are no longer available")
    if old.support_minutes != new.support_minutes:
        out.append(f"one-to-one time changed from {old.support_minutes} to {new.support_minutes} min")
    if old.prep_minutes != new.prep_minutes:
        out.append(f"preparation time changed from {old.prep_minutes} to {new.prep_minutes} min")
    if old.lesson_minutes != new.lesson_minutes:
        out.append(f"lesson length changed from {old.lesson_minutes} to {new.lesson_minutes} min")
    if old.class_size != new.class_size:
        out.append(f"class size changed from {old.class_size} to {new.class_size}")
    if old.notes.strip() != new.notes.strip() and new.notes.strip():
        out.append(f"new note: {new.notes.strip()}")
    return out


def _next_id(existing: list[Adaptation]) -> int:
    nums = [int(a.id[1:]) for a in existing if a.id[1:].isdigit()]
    return max(nums, default=0) + 1


def _with_ids(drafts: list[DraftAdaptation], existing: list[Adaptation]) -> list[Adaptation]:
    start = _next_id(existing)
    return [Adaptation(**d.model_dump(exclude={"replaces"}), id=f"a{start + i}") for i, d in enumerate(drafts)]


def _merge_revisions(current: list[Adaptation], rejected: list[tuple[Adaptation | None, str, list[str]]],
                     drafts: list[DraftAdaptation]) -> list[Adaptation]:
    """Revisions keep the id of what they replace, so the teacher can follow one recommendation across versions."""
    open_ids = [a.id for a, _, _ in rejected if a is not None]
    by_id = {a.id: a for a in current}
    rejected_learners = {lid for _, lid, _ in rejected}
    open_missing = [lid for a, lid, _ in rejected if a is None]
    kept = {(a.learner_id, a.strategy.strip().lower()) for a in current if a.id not in open_ids}
    replaced: dict[str, Adaptation] = {}
    added: list[DraftAdaptation] = []
    for d in drafts:
        # A revision may only replace rejected work; re-sent copies of approved items are ignored.
        if d.learner_id not in rejected_learners or (d.learner_id, d.strategy.strip().lower()) in kept:
            continue
        target = d.replaces if d.replaces in open_ids else None
        if target is None:
            target = next((i for i in open_ids if by_id[i].learner_id == d.learner_id), None)
        if target is None:
            if d.learner_id in open_missing:
                open_missing.remove(d.learner_id)
                added.append(d)
            continue
        open_ids.remove(target)
        old = by_id[target]
        replaced[target] = Adaptation(**d.model_dump(exclude={"replaces"}), id=target, revision=old.revision + 1)
    merged = [replaced.get(a.id, a) for a in current]
    return merged + _with_ids(added, merged)
