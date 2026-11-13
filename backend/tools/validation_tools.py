"""Deterministic checks the Reviewer runs before any model-based judgement."""

import re
from dataclasses import asdict, dataclass

from models.curriculum import MAX_SENTENCE_WORDS
from models.schemas import WHOLE_CLASS, Adaptation, FlowPhase, LearnerMaterial, LessonRequest
from tools.safety_tools import find_labels
from tools.text_tools import sentences, similarity, word_count

PRINT_TERMS = ["print", "printed", "printing", "printout", "printouts", "worksheet", "worksheets",
               "photocopy", "photocopies", "photocopied", "handout", "handouts"]
DEVICE_TERMS = ["tablet", "tablets", "computer", "computers", "laptop", "laptops", "cellphone", "cellphones",
                "phone", "phones", "projector", "smartboard", "video", "videos", "online", "app", "apps"]
NOISE_TERMS = ["aloud", "out loud", "listen", "listens", "listening", "verbal", "verbally", "spoken", "audio",
               "song", "songs", "sing", "singing", "oral", "orally", "discuss", "discussion", "whisper",
               "whispering", "call out", "read to"]
_NEGATORS = ("instead of", "without", "no ", "not ", "rather than", "replace", "avoid", "never", "don't", "do not")


@dataclass
class Issue:
    check: str
    message: str
    adaptation_id: str | None = None
    learner_id: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class CheckResult:
    check: str
    label: str
    passed: bool
    detail: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def find_terms(text: str, terms: list[str]) -> list[str]:
    """Whole-word terms in text that are not negated just before ('instead of printed sheets' is fine)."""
    low = (text or "").lower()
    found = []
    for term in terms:
        for m in re.finditer(r"\b" + re.escape(term) + r"\b", low):
            window = low[max(0, m.start() - 30):m.start()]
            if not any(neg in window for neg in _NEGATORS):
                found.append(term)
                break
    return found


def _adaptation_text(a: Adaptation) -> str:
    return " ".join([a.strategy, a.instruction, *a.materials])


def check_adaptations(
    adaptations: list[Adaptation],
    request: LessonRequest,
    failed_strategies: list[dict] | None = None,
) -> tuple[list[Issue], list[CheckResult]]:
    c = request.constraints
    issues: list[Issue] = []
    learner_ids = {l.id for l in request.learners}
    names = {l.id: l.name for l in request.learners}
    label = lambda lid: "the whole class" if lid == WHOLE_CLASS else names.get(lid, lid)

    # Teacher time: no single activity over budget, and the total must fit too.
    budget = c.support_minutes
    over_single = [a for a in adaptations if a.teacher_minutes > budget]
    for a in over_single:
        issues.append(Issue("teacher_time",
            f"'{a.strategy}' for {label(a.learner_id)} needs {a.teacher_minutes} min of one-to-one teacher time, "
            f"but only {budget} min is available for the whole lesson.", a.id, a.learner_id))
    total = sum(a.teacher_minutes for a in adaptations)
    if total > budget:
        flagged = {a.id for a in over_single}
        remaining = total - sum(a.teacher_minutes for a in over_single)
        for a in sorted(adaptations, key=lambda x: -x.teacher_minutes):
            if remaining <= budget:
                break
            if a.id in flagged or a.teacher_minutes == 0:
                continue
            remaining -= a.teacher_minutes
            issues.append(Issue("teacher_time",
                f"Together the adaptations need {total} min of one-to-one time (budget {budget} min). "
                f"'{a.strategy}' for {label(a.learner_id)} ({a.teacher_minutes} min) must become something the "
                f"learner can do independently or with a peer.", a.id, a.learner_id))

    prep_budget = c.prep_minutes
    prep_total = sum(a.prep_minutes for a in adaptations)
    over_prep = [a for a in adaptations if a.prep_minutes > prep_budget]
    for a in over_prep:
        issues.append(Issue("prep_time",
            f"'{a.strategy}' for {label(a.learner_id)} needs {a.prep_minutes} min of preparation, but the teacher "
            f"only has {prep_budget} min to prepare.", a.id, a.learner_id))
    if prep_total > prep_budget:
        flagged = {a.id for a in over_prep}
        remaining = prep_total - sum(a.prep_minutes for a in over_prep)
        for a in sorted(adaptations, key=lambda x: -x.prep_minutes):
            if remaining <= prep_budget:
                break
            if a.id in flagged or a.prep_minutes == 0:
                continue
            remaining -= a.prep_minutes
            issues.append(Issue("prep_time",
                f"Together the adaptations need {prep_total} min of preparation (the teacher has {prep_budget} min). "
                f"'{a.strategy}' for {label(a.learner_id)} ({a.prep_minutes} min) must use less preparation.",
                a.id, a.learner_id))

    for a in adaptations:
        text = _adaptation_text(a)
        if a.learner_id != WHOLE_CLASS and a.learner_id not in learner_ids:
            issues.append(Issue("coverage", f"'{a.strategy}' refers to an unknown learner '{a.learner_id}'.", a.id, a.learner_id))
        if not c.has_printer and (hits := find_terms(text, PRINT_TERMS)):
            issues.append(Issue("printer", f"'{a.strategy}' depends on printing ({', '.join(hits)}), but there is no printer.", a.id, a.learner_id))
        if not c.has_devices and (hits := find_terms(text, DEVICE_TERMS)):
            issues.append(Issue("devices", f"'{a.strategy}' needs devices ({', '.join(hits)}), but learners have none.", a.id, a.learner_id))
        if c.noisy_venue and (hits := find_terms(text, NOISE_TERMS)):
            issues.append(Issue("noise",
                f"'{a.strategy}' relies on listening or speaking ({', '.join(hits)}), which will not work well in a "
                f"noisy venue. Use visual, written or gesture cues instead.", a.id, a.learner_id))
        if labels := find_labels(text):
            issues.append(Issue("labels", f"'{a.strategy}' uses diagnostic or deficit labels ({', '.join(labels)}).", a.id, a.learner_id))

    for lid in learner_ids - {a.learner_id for a in adaptations}:
        issues.append(Issue("coverage", f"{names[lid]} has a support profile but no adaptation.", None, lid))

    did_not_work = [f for f in (failed_strategies or []) if f.get("outcome") == "Did not work"]
    for a in adaptations:
        for past in did_not_work:
            if past["learner_id"] != a.learner_id:
                continue
            past_text = f"{past.get('strategy') or ''} {past.get('instruction') or ''}"
            if similarity(_adaptation_text(a), past_text) >= 0.4:
                issues.append(Issue("memory",
                    f"'{a.strategy}' repeats a strategy the teacher reported did not work for {label(a.learner_id)} "
                    f"(\"{past.get('strategy') or past.get('instruction')}\", {past.get('topic') or 'earlier lesson'}).",
                    a.id, a.learner_id))
                break

    failed = {i.check for i in issues}
    results = [
        CheckResult("teacher_time", f"One-to-one teacher time fits the {budget}-minute budget",
                    "teacher_time" not in failed, f"{total} min planned"),
        CheckResult("prep_time", f"Preparation fits the {prep_budget} minutes you have", "prep_time" not in failed,
                    f"{prep_total} min planned"),
        CheckResult("coverage", "Every learner profile has matching support", "coverage" not in failed),
        CheckResult("labels", "No diagnostic or deficit labels", "labels" not in failed),
    ]
    if not c.has_printer:
        results.append(CheckResult("printer", "Nothing needs printing", "printer" not in failed))
    if not c.has_devices:
        results.append(CheckResult("devices", "No learner devices needed", "devices" not in failed))
    if c.noisy_venue:
        results.append(CheckResult("noise", "Works in a noisy venue", "noise" not in failed))
    if did_not_work:
        results.append(CheckResult("memory", "Avoids strategies you reported did not work", "memory" not in failed))
    return issues, results


def check_material(material: LearnerMaterial, request: LessonRequest, english: bool = True) -> list[Issue]:
    c = request.constraints
    issues: list[Issue] = []
    body = " ".join([*material.explanation, material.everyday_example, material.activity])
    if not c.has_printer and (hits := find_terms(body, PRINT_TERMS)):
        issues.append(Issue("printer", f"The activity depends on printing ({', '.join(hits)})."))
    if not c.has_devices and (hits := find_terms(body, DEVICE_TERMS)):
        issues.append(Issue("devices", f"The material needs devices ({', '.join(hits)})."))
    if labels := find_labels(body + " " + material.teacher_tip):
        issues.append(Issue("labels", f"The material uses diagnostic or deficit labels ({', '.join(labels)})."))
    if english:
        limit = MAX_SENTENCE_WORDS[request.grade] + 6
        learner_text = [*material.explanation, material.everyday_example, *(q.prompt for q in material.practice)]
        long = [s for t in learner_text for s in sentences(t) if word_count(s) > limit]
        if long:
            issues.append(Issue("readability",
                f"{len(long)} sentence(s) are too long for {request.grade} readers (keep under "
                f"{MAX_SENTENCE_WORDS[request.grade]} words). Longest: \"{max(long, key=word_count)}\""))
    return issues


def rebalance_flow(flow: list[FlowPhase], lesson_minutes: int) -> tuple[list[FlowPhase], bool]:
    total = sum(p.minutes for p in flow)
    if total == lesson_minutes:
        return flow, False
    scaled = [max(1, round(p.minutes * lesson_minutes / total)) for p in flow]
    drift = lesson_minutes - sum(scaled)
    longest = max(range(len(scaled)), key=lambda i: scaled[i])
    scaled[longest] = max(1, scaled[longest] + drift)
    return [p.model_copy(update={"minutes": m}) for p, m in zip(flow, scaled)], True
