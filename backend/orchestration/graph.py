"""The lesson-planning workflow as a LangGraph state graph.

The model makes the judgement calls (the work plan, where rejected work goes, how to fix it). Code enforces the
guardrails: nothing reaches the teacher without passing the Reviewer, loops are capped, languages are never chosen
by the AI, and escalation to the teacher only happens after a real attempt to fix the work.
"""

from typing import TYPE_CHECKING, Any, Callable, TypedDict

from langgraph.graph import END, START, StateGraph

from agents.base import AgentOutputError
from agents.reviewer import ReviewOutcome
from llm.client import LLMClient, LLMError
from models.schemas import Adaptation, LessonAnalysis, LessonRequest, NeedsMatch, WorkPlan, language_name
from orchestration.events import RunTrace

if TYPE_CHECKING:
    from orchestration.workflow import Orchestrator

ORCHESTRATOR = "Orchestrator"

# Display information for the live graph. Keys are LangGraph node names.
NODES: dict[str, dict[str, str]] = {
    "screen": {"agent": "Orchestrator", "label": "Safety screen"},
    "recall": {"agent": "Progress Tracker", "label": "Recall feedback"},
    "plan": {"agent": "Orchestrator", "label": "Plan the work"},
    "analyse": {"agent": "Lesson Analyst", "label": "Analyse lesson"},
    "match": {"agent": "Needs Matcher", "label": "Match needs"},
    "design": {"agent": "Adaptation Designer", "label": "Design (tools)"},
    "review": {"agent": "Reviewer", "label": "Review"},
    "route": {"agent": "Orchestrator", "label": "Route decision"},
    "personalise": {"agent": "Personalisation Agent", "label": "Personalise"},
    "translate": {"agent": "Language Agent", "label": "Translate"},
    "pack": {"agent": "Pack Builder", "label": "Build pack"},
}


class PlanState(TypedDict, total=False):
    trace: RunTrace
    llm: LLMClient
    req: LessonRequest
    owner_id: str | None
    memory: list[dict]
    work_plan: WorkPlan
    personalise_ids: list[str]
    analysis: LessonAnalysis
    needs: NeedsMatch
    adaptations: list[Adaptation] | None
    review: ReviewOutcome
    review_round: int
    attempts: int
    corrections: int
    pending: list[tuple[Adaptation | None, str, list[str]]]
    route: str
    route_guidance: str
    analyst_feedback: str
    analyst_used: bool
    unresolved: dict[str, list[str]]
    materials: dict
    material_warnings: list[str]
    translations: dict
    result: dict


def build_graph(orch: "Orchestrator"):
    max_attempts = orch.settings.max_design_attempts

    def node(name: str, fn: Callable[[PlanState], dict]) -> Callable[[PlanState], dict]:
        def run(state: PlanState) -> dict:
            state["trace"].node = name
            return fn(state)
        return run

    # ------------------------------------------------------------ nodes

    def screen(s: PlanState) -> dict:
        return {"req": orch._screen(s["trace"], s["req"])}

    def recall(s: PlanState) -> dict:
        return {"memory": orch.tracker.recall(orch.store, s["trace"], s["req"], s.get("owner_id"), orch.activity)}

    def plan(s: PlanState) -> dict:
        trace, req = s["trace"], s["req"]
        try:
            work = orch.planner.run(s["llm"], trace, req, s["memory"])
        except (AgentOutputError, LLMError) as exc:
            trace.emit(ORCHESTRATOR, "warning", "Planner unavailable; using the default plan", str(exc))
            work = WorkPlan(summary="Default plan: support every learner with a profile.",
                            personalise_for=[l.id for l in req.learners])

        valid = {l.id for l in req.learners}
        by_label = {l.name.strip().lower(): l.id for l in req.learners}
        requested = [by_label.get(i.strip().lower(), i) for i in work.personalise_for]
        chosen = [i for i in dict.fromkeys(requested) if i in valid]
        guardrails = []
        if len(chosen) != len(set(requested)):
            guardrails.append("Ignored learner ids that are not in this class.")
        for l in req.learners:
            if l.language != "en" and l.id not in chosen:
                chosen.append(l.id)
                guardrails.append(f"{l.name} learns in {language_name(l.language)}, so they always get their own "
                                  "material to translate.")
        for g in guardrails:
            trace.emit(ORCHESTRATOR, "decision", "Guardrail applied to the plan", g)

        names = {l.id: l.name for l in req.learners}
        non_english = [l for l in req.learners if l.language != "en"]
        steps = [
            ("Lesson Analyst", "Identify what the lesson demands of learners and propose a timed flow"),
            ("Needs Matcher", f"Compare lesson demands with {len(req.learners)} support profiles")
            if req.learners else ("Needs Matcher", "Skipped: no learner profiles, so plan for the whole class"),
            ("Adaptation Designer + Reviewer", f"Design with the check_plan tool, then independent review "
                                               f"(up to {max_attempts} rounds)"),
            ("Personalisation Agent", "Write material for the whole class"
             + (f" and {', '.join(names[i] for i in chosen)}" if chosen else "")),
            ("Language Agent", "Translate and back-check for " + ", ".join(
                f"{l.name} ({language_name(l.language)}, chosen by the teacher)" for l in non_english))
            if non_english else ("Language Agent", "Skipped: every learner's selected language is English"),
            ("Pack Builder", "Assemble the lesson-support pack for teacher review"),
        ]
        trace.emit(ORCHESTRATOR, "plan", f"Planned the work for {req.grade} {req.subject}: {req.topic}",
                   work.summary + "\n" + "\n".join(f"{a}: {d}" for a, d in steps),
                   {"steps": [{"agent": a, "action": d} for a, d in steps],
                    "priorities": [p.model_dump() for p in work.priorities],
                    "design_guidance": work.design_guidance, "risks": work.risks, "guardrails": guardrails})
        return {"work_plan": work, "personalise_ids": chosen}

    def analyse(s: PlanState) -> dict:
        trace, req = s["trace"], s["req"]
        analysis = orch.analyst.run(s["llm"], trace, req, s.get("analyst_feedback", ""))
        analysis = orch._fit_flow(trace, analysis, req.constraints.lesson_minutes)
        return {"analysis": analysis, "adaptations": None, "analyst_feedback": "", "needs": NeedsMatch()}

    def match(s: PlanState) -> dict:
        return {"needs": orch.matcher.run(s["llm"], s["trace"], s["req"], s["analysis"], s["memory"])}

    def design(s: PlanState) -> dict:
        from orchestration.workflow import _merge_revisions, _with_ids
        trace, req = s["trace"], s["req"]
        guidance = s.get("route_guidance") or s["work_plan"].design_guidance
        attempts = s.get("attempts", 0) + 1
        if s.get("adaptations") is None:
            drafts = orch.designer.design(s["llm"], trace, req, s["analysis"], s["needs"], s["memory"], guidance=guidance)
            return {"adaptations": _with_ids(drafts, []), "attempts": attempts}
        pending = s["pending"]
        keep = [a for a in s["adaptations"] if a.id not in {p[0].id for p in pending if p[0] is not None}]
        drafts = orch.designer.revise(s["llm"], trace, req, s["analysis"], s["needs"], s["memory"], keep, pending,
                                      attempts, guidance=guidance)
        return {"adaptations": _merge_revisions(s["adaptations"], pending, drafts), "attempts": attempts,
                "corrections": s.get("corrections", 0) + 1, "route_guidance": ""}

    def review(s: PlanState) -> dict:
        trace = s["trace"]
        rnd = s.get("review_round", 0) + 1
        outcome = orch.reviewer.review_adaptations(s["llm"], trace, s["req"], s["analysis"], s["adaptations"],
                                                   s["memory"], round_label=f"round {rnd}")
        if outcome.passed:
            corrections = s.get("corrections", 0)
            trace.emit(ORCHESTRATOR, "decision", "Adaptations approved; moving on to learner material",
                       f"Approved after {rnd} review round(s)" + (f" and {corrections} correction(s)" if corrections else ""))
        return {"review": outcome, "review_round": rnd}

    def route(s: PlanState) -> dict:
        trace, req, outcome = s["trace"], s["req"], s["review"]
        attempts = s.get("attempts", 0)
        if attempts >= max_attempts:
            unresolved = _unresolved(outcome)
            trace.emit(ORCHESTRATOR, "warning", f"Stopped after {max_attempts} design attempts",
                       f"{len(outcome.issues)} concern(s) remain. They are flagged in the pack for your decision rather "
                       "than hidden.", {"unresolved": unresolved})
            return {"route": "escalate", "unresolved": unresolved}

        pending = _pending(s["adaptations"], outcome)
        names = {l.id: l.name for l in req.learners}
        rejected = [{"id": a.id if a else None, "learner": names.get(lid, "whole class"),
                     "strategy": a.strategy if a else None, "problems": msgs,
                     "checks": sorted({i.check for i in outcome.issues
                                       if i.adaptation_id == (a.id if a else None) and (a or i.learner_id == lid)})}
                    for a, lid, msgs in pending]
        try:
            decision = orch.router.run(s["llm"], trace, req, s["analysis"], rejected, attempts, max_attempts,
                                       s.get("analyst_used", False))
            choice, reason, guidance = decision.route, decision.reason, decision.guidance
        except (AgentOutputError, LLMError) as exc:
            trace.emit(ORCHESTRATOR, "warning", "Router unavailable; sending the work back to the Adaptation Designer",
                       str(exc))
            choice, reason, guidance = "designer", "Default route.", ""

        if choice == "analyst" and s.get("analyst_used"):
            trace.emit(ORCHESTRATOR, "decision", "Guardrail: the lesson was already re-analysed once",
                       "Sending the work to the Adaptation Designer instead.")
            choice = "designer"
        if choice == "teacher" and attempts < 2:
            trace.emit(ORCHESTRATOR, "decision", "Guardrail: Mothusi tries one revision before escalating",
                       "Sending the work to the Adaptation Designer first.")
            choice = "designer"

        if choice == "analyst":
            trace.emit(ORCHESTRATOR, "decision", "Sending the lesson back to the Lesson Analyst", reason,
                       {"rejected": [r["id"] for r in rejected]})
            return {"route": "analyst", "analyst_used": True, "analyst_feedback": f"{reason} {guidance}".strip(),
                    "route_guidance": guidance}
        if choice == "teacher":
            unresolved = _unresolved(outcome)
            trace.emit(ORCHESTRATOR, "warning", "Escalated to the teacher", reason, {"unresolved": unresolved})
            return {"route": "escalate", "unresolved": unresolved}

        keep = len(s["adaptations"]) - sum(1 for a, _, _ in pending if a is not None)
        trace.emit(ORCHESTRATOR, "decision",
                   f"Sending {len(pending)} item(s) back to the Adaptation Designer; keeping {keep}",
                   "\n".join(f"{(a.strategy if a else names.get(lid, lid))}: {msgs[0]}" for a, lid, msgs in pending)
                   + (f"\nWhy: {reason}" if reason else ""),
                   {"rejected": [r["id"] or r["learner"] for r in rejected], "guidance": guidance})
        return {"route": "designer", "pending": pending, "route_guidance": guidance}

    def personalise(s: PlanState) -> dict:
        trace, req = s["trace"], s["req"]
        chosen = set(s.get("personalise_ids", []))
        shared = [l.name for l in req.learners if l.id not in chosen]
        if shared:
            trace.emit(ORCHESTRATOR, "decision", f"{', '.join(shared)} will use the whole-class material",
                       "The work plan found their support is covered by the class material and their adaptations.")
        targets = [None, *[l for l in req.learners if l.id in chosen]]
        materials, warnings = orch._materials(trace, s["llm"], req, s["analysis"], s["adaptations"], targets)
        return {"materials": materials, "material_warnings": warnings}

    def translate(s: PlanState) -> dict:
        non_english = [l for l in s["req"].learners if l.language != "en"]
        return {"translations": orch._translations(s["trace"], s["llm"], s["req"], s["materials"], non_english)}

    def pack(s: PlanState) -> dict:
        from orchestration.workflow import DesignResult
        design_result = DesignResult(s["adaptations"], s["review"], s.get("attempts", 0), s.get("corrections", 0),
                                     s.get("unresolved", {}))
        result = orch._finish(s["trace"], s["req"], s["analysis"], s["needs"], design_result, s["memory"],
                              s.get("materials", {}), s.get("translations", {}), s.get("material_warnings", []),
                              changes=[])
        return {"result": result}

    # ------------------------------------------------------------ edges

    def after_analyse(s: PlanState) -> str:
        return "profiles to match" if s["req"].learners else "no profiles"

    def after_review(s: PlanState) -> str:
        return "approved" if s["review"].passed else "rejected"

    def after_route(s: PlanState) -> str:
        return {"designer": "revise", "analyst": "re-analyse"}.get(s["route"], "escalate to teacher")

    def after_personalise(s: PlanState) -> str:
        needs_translation = any(l.language != "en" and s["materials"].get(l.id) for l in s["req"].learners)
        return "selected languages" if needs_translation else "all English"

    g = StateGraph(PlanState)
    for name, fn in [("screen", screen), ("recall", recall), ("plan", plan), ("analyse", analyse), ("match", match),
                     ("design", design), ("review", review), ("route", route), ("personalise", personalise),
                     ("translate", translate), ("pack", pack)]:
        g.add_node(name, node(name, fn))
    g.add_edge(START, "screen")
    g.add_edge("screen", "recall")
    g.add_edge("recall", "plan")
    g.add_edge("plan", "analyse")
    g.add_conditional_edges("analyse", after_analyse, {"profiles to match": "match", "no profiles": "design"})
    g.add_edge("match", "design")
    g.add_edge("design", "review")
    g.add_conditional_edges("review", after_review, {"approved": "personalise", "rejected": "route"})
    g.add_conditional_edges("route", after_route,
                            {"revise": "design", "re-analyse": "analyse", "escalate to teacher": "personalise"})
    g.add_conditional_edges("personalise", after_personalise, {"selected languages": "translate", "all English": "pack"})
    g.add_edge("translate", "pack")
    g.add_edge("pack", END)
    return g.compile()


def graph_structure(compiled: Any) -> dict:
    """Nodes and edges for the frontend's live graph, read from the compiled LangGraph."""
    g = compiled.get_graph()
    nodes = [{"id": n, **NODES.get(n, {"agent": "", "label": n.strip("_")})} for n in g.nodes]
    edges = [{"source": e.source, "target": e.target, "conditional": e.conditional, "label": e.data or ""}
             for e in g.edges]
    return {"nodes": nodes, "edges": edges}


def _pending(adaptations: list[Adaptation], outcome: ReviewOutcome) -> list[tuple[Adaptation | None, str, list[str]]]:
    by_id: dict[str, list[str]] = {}
    missing: dict[str, list[str]] = {}
    for issue in outcome.issues:
        if issue.adaptation_id:
            by_id.setdefault(issue.adaptation_id, []).append(issue.message)
        elif issue.learner_id:
            missing.setdefault(issue.learner_id, []).append(issue.message)
    pending: list[tuple[Adaptation | None, str, list[str]]] = [
        (a, a.learner_id, by_id[a.id]) for a in adaptations if a.id in by_id]
    pending += [(None, lid, msgs) for lid, msgs in missing.items()]
    return pending


def _unresolved(outcome: ReviewOutcome) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for issue in outcome.issues:
        out.setdefault(issue.adaptation_id or issue.learner_id or "plan", []).append(issue.message)
    return out
