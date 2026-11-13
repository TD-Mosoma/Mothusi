from orchestration.events import RunTrace
from llm.client import LLMClient
from models.schemas import LessonAnalysis, LessonRequest, NeedsMatch
from agents.base import Agent, compact, describe_learners, describe_memory

SHAPE = """{
  "needs": [{"learner_id": "id from the profile list", "demand": "which lesson demand",
             "barrier": "what may be hard, strengths-based", "leverage": "strength or strategy to build on",
             "priority": "high|medium|low"}],
  "whole_class_considerations": ["..."]
}"""


class NeedsMatcher(Agent):
    name = "Needs Matcher"
    task = "needs_matcher"
    system = (
        "You are the Needs Matcher. You compare a lesson's demands with each learner's support profile and find "
        "where a learner may need extra support. Write in strengths-based language (what may be hard, and what "
        "already helps). Use only the teacher's notes."
    )

    def run(self, llm: LLMClient, trace: RunTrace, req: LessonRequest, analysis: LessonAnalysis,
            memory: list[dict]) -> NeedsMatch:
        trace.emit(self.name, "agent_started", f"Comparing lesson demands with {len(req.learners)} learner profiles")
        prompt = (
            f"Lesson objective: {analysis.objective_summary}\n"
            f"Lesson demands: {compact([d.model_dump() for d in analysis.demands])}\n\n"
            f"Learner profiles:\n{describe_learners(req)}\n\n"
            f"What earlier lessons taught us (teacher feedback):\n{describe_memory(memory)}\n\n"
            "For each learner list 1–3 places where a lesson demand clashes with their profile, using the exact "
            "learner id. Also list up to 4 whole-class considerations.\n\n"
            f"Shape:\n{SHAPE}"
        )
        match, completion, ms = self.call(
            llm, trace, prompt, NeedsMatch,
            context={"request": req.model_dump(), "analysis": analysis.model_dump()},
        )
        valid = {l.id for l in req.learners}
        dropped = [n for n in match.needs if n.learner_id not in valid]
        match.needs = [n for n in match.needs if n.learner_id in valid]
        if dropped:
            trace.emit(self.name, "warning", f"Ignored {len(dropped)} match(es) for unknown learners",
                       ", ".join(sorted({n.learner_id for n in dropped})))
        names = {l.id: l.name for l in req.learners}
        self.output(
            trace,
            f"Identified {len(match.needs)} support needs across {len({n.learner_id for n in match.needs})} learners",
            "; ".join(f"{names[n.learner_id]}: {n.demand} — build on {n.leverage}" for n in match.needs[:6]),
            {"needs": [n.model_dump() for n in match.needs],
             "whole_class_considerations": match.whole_class_considerations},
            completion, ms,
        )
        return match
