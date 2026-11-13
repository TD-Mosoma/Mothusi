from orchestration.events import RunTrace
from llm.client import LLMClient
from models.schemas import LessonAnalysis, LessonRequest
from agents.base import Agent, describe_constraints, describe_lesson

SHAPE = """{
  "objective_summary": "one sentence",
  "success_criteria": ["Learners can ...", "..."],
  "key_vocabulary": ["half", "quarter"],
  "demands": [
    {"kind": "listening|speaking|reading|writing|visual|hands_on|number_work|group_work|transitions|sustained_attention|fine_motor|new_vocabulary|other",
     "description": "what learners must do", "phase": "lesson phase", "load": "low|medium|high"}
  ],
  "flow": [{"label": "Introduction", "minutes": 5, "activity": "what happens"}]
}"""


class LessonAnalyst(Agent):
    name = "Lesson Analyst"
    task = "lesson_analyst"
    system = (
        "You are the Lesson Analyst. You read a lesson and identify exactly what it demands of young learners: "
        "listening, speaking, reading, writing, visual work, hands-on work, number work, group work, transitions, "
        "sustained attention, fine motor work and new vocabulary. Only list demands that are really in the lesson. "
        "You also propose a realistic lesson flow for the age group."
    )

    def run(self, llm: LLMClient, trace: RunTrace, req: LessonRequest, feedback: str = "") -> LessonAnalysis:
        trace.emit(self.name, "agent_started",
                   "Re-analysing the lesson after the Orchestrator's routing decision" if feedback
                   else "Reading the lesson to find what it demands of learners",
                   feedback or f"{req.grade} {req.subject}: {req.topic}")
        prompt = (
            f"{describe_lesson(req)}\n\nClassroom conditions:\n{describe_constraints(req)}\n\n"
            f"Identify 3–8 learning demands and 2–4 success criteria written for {req.grade}. "
            f"Propose a lesson flow of 3–6 phases whose minutes add up to exactly {req.constraints.lesson_minutes}.\n"
            + (f"Your previous analysis caused problems downstream. Fix this: {feedback}\n" if feedback else "")
            + "\n"
            f"Shape:\n{SHAPE}"
        )
        analysis, completion, ms = self.call(llm, trace, prompt, LessonAnalysis, context={"request": req.model_dump(), "feedback": feedback})
        high = [d for d in analysis.demands if d.load == "high"]
        self.output(
            trace,
            f"Found {len(analysis.demands)} lesson demands ({len(high)} high-load)",
            "; ".join(f"{d.kind.replace('_', ' ')}: {d.description}" for d in analysis.demands[:6]),
            {"demands": [d.model_dump() for d in analysis.demands], "success_criteria": analysis.success_criteria,
             "flow": [p.model_dump() for p in analysis.flow]},
            completion, ms,
        )
        return analysis
