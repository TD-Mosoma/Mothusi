"""The Orchestrator's own reasoning: planning the work and routing rejected work. Guardrails live in the graph."""

from orchestration.events import RunTrace
from llm.client import LLMClient
from models.schemas import LessonAnalysis, LessonRequest, RouteDecision, WorkPlan
from agents.base import Agent, compact, describe_constraints, describe_learners, describe_lesson, describe_memory

PLAN_SHAPE = """{
  "summary": "two or three sentences: what matters most in this lesson and how the team should approach it",
  "priorities": [{"learner_id": "id", "focus": "what to get right for this learner", "priority": "high|medium|low"}],
  "personalise_for": ["learner ids who need their own learner material"],
  "design_guidance": "concrete advice for the Adaptation Designer",
  "risks": ["what could go wrong in this classroom"]
}"""

ROUTE_SHAPE = """{"route": "designer|analyst|teacher", "reason": "one sentence", "guidance": "what the next agent must change"}"""


class Planner(Agent):
    name = "Orchestrator"
    task = "planner"
    system = (
        "You are the Orchestrator of Mothusi, a team of AI agents. Before any work starts you read the teacher's "
        "request and plan it: which learners need the most attention and why, which learners need their own "
        "learner material (others can use the whole-class material), what the Adaptation Designer must keep in "
        "mind, and what could go wrong in this classroom."
    )

    def run(self, llm: LLMClient, trace: RunTrace, req: LessonRequest, memory: list[dict]) -> WorkPlan:
        trace.emit(self.name, "agent_started", "Planning the work for this lesson",
                   f"{len(req.learners)} learner profile(s), {req.constraints.support_minutes} min one-to-one budget")
        prompt = (
            f"{describe_lesson(req)}\n\nLearner profiles:\n{describe_learners(req)}\n\n"
            f"Classroom conditions:\n{describe_constraints(req)}\n\n"
            f"What earlier lessons taught us:\n{describe_memory(memory)}\n\n"
            "Use the exact learner ids. A learner needs their own material when their support differs from what "
            "the whole class will get.\n\n"
            f"Shape:\n{PLAN_SHAPE}"
        )
        plan, completion, ms = self.call(llm, trace, prompt, WorkPlan,
                                         context={"request": req.model_dump(), "memory": memory})
        self.output(trace, "Work plan decided", plan.summary,
                    {"priorities": [p.model_dump() for p in plan.priorities], "personalise_for": plan.personalise_for,
                     "design_guidance": plan.design_guidance, "risks": plan.risks}, completion, ms)
        return plan


class Router(Agent):
    name = "Orchestrator"
    task = "router"
    system = (
        "You are the Orchestrator of Mothusi. The Reviewer has rejected some work. Decide where it goes next:\n"
        "- designer: the adaptations themselves need fixing (the usual case).\n"
        "- analyst: the problem is the lesson analysis itself (for example the flow leaves no time for the "
        "support, or the lesson demands were misread), so the lesson must be re-analysed first.\n"
        "- teacher: no adaptation can satisfy the constraints and only the teacher can decide (for example the "
        "teacher allowed 0 minutes but a learner's stated support needs the teacher personally).\n"
        "Prefer designer. Give guidance the next agent can act on."
    )

    def run(self, llm: LLMClient, trace: RunTrace, req: LessonRequest, analysis: LessonAnalysis,
            rejected: list[dict], attempt: int, max_attempts: int, analyst_used: bool) -> RouteDecision:
        trace.emit(self.name, "agent_started", f"Deciding where {len(rejected)} rejected item(s) should go",
                   f"Design attempt {attempt} of {max_attempts}")
        prompt = (
            f"{req.grade} {req.subject}: {req.topic}. Objective: {analysis.objective_summary}\n"
            f"Lesson flow: {compact([p.model_dump() for p in analysis.flow])}\n"
            f"Classroom conditions:\n{describe_constraints(req)}\n\n"
            f"Rejected by the Reviewer:\n{compact(rejected)}\n\n"
            f"Design attempts used: {attempt} of {max_attempts}. "
            f"Lesson already re-analysed once: {'yes' if analyst_used else 'no'}.\n\n"
            f"Shape:\n{ROUTE_SHAPE}"
        )
        decision, completion, ms = self.call(llm, trace, prompt, RouteDecision,
                                             context={"rejected": rejected, "attempt": attempt})
        self.output(trace, f"Routing decision: {decision.route}", decision.reason,
                    {"route": decision.route, "guidance": decision.guidance}, completion, ms)
        return decision
