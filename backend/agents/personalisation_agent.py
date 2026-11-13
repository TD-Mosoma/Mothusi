from orchestration.events import RunTrace
from llm.client import LLMClient
from models.curriculum import AGE_RANGE, MAX_SENTENCE_WORDS
from models.schemas import Adaptation, LearnerMaterial, LearnerProfile, LessonAnalysis, LessonRequest
from agents.base import Agent, compact, describe_constraints

SHAPE = """{
  "title": "short, friendly title",
  "explanation": ["short sentence", "short sentence", "short sentence"],
  "everyday_example": "an example from a South African child's daily life",
  "activity": "a hands-on task using things in the classroom or at home",
  "practice": [
    {"prompt": "question", "options": [{"text": "answer", "fraction": null}], "answer_index": 0,
     "hint": "a gentle hint, not the answer"}
  ],
  "teacher_tip": "one practical tip for the teacher"
}"""

STYLES = {
    "simpler": "Use even shorter sentences and smaller numbers. One idea per sentence.",
    "visual": "Describe things the learner can see and draw. Use pictures in the practice questions.",
    "practical": "Use objects the learner can touch and move: sharing food, counting stones, folding paper.",
}


class PersonalisationAgent(Agent):
    name = "Personalisation Agent"
    task = "personalisation"
    system = (
        "You are the Personalisation Agent. You write learner-facing material for young South African children: "
        "a short explanation, an everyday example, a hands-on activity and practice questions. Every version keeps "
        "the same learning objective; only the route changes."
    )

    def run(self, llm: LLMClient, trace: RunTrace, req: LessonRequest, analysis: LessonAnalysis,
            learner: LearnerProfile | None, adaptations: list[Adaptation], *, attempt: int = 1,
            fix: list[str] | None = None, style: str | None = None,
            interests: list[str] | None = None) -> LearnerMaterial:
        who = learner.name if learner else "the whole class"
        title = f"Writing learner material for {who}" + (f" (attempt {attempt})" if attempt > 1 else "")
        trace.emit(self.name, "agent_started", title, STYLES.get(style or "", ""))
        profile = (f"Learner: strengths: {learner.strengths or 'not recorded'}; support that helps: "
                   f"{learner.support or 'not recorded'}" if learner else "Write for the whole class.")
        fractions = "fraction" in f"{req.topic} {req.objectives}".lower()
        prompt = (
            f"{req.grade} (ages {AGE_RANGE[req.grade]}) {req.subject}: {req.topic}\n"
            f"Objective: {analysis.objective_summary}\n"
            f"Key vocabulary: {compact(analysis.key_vocabulary)}\n{profile}\n"
            f"Approved classroom adaptations for this learner: "
            f"{compact([{'strategy': a.strategy, 'instruction': a.instruction} for a in adaptations]) or 'none'}\n\n"
            f"Classroom conditions:\n{describe_constraints(req)}\n\n"
            f"Write in simple English. Keep every sentence under {MAX_SENTENCE_WORDS[req.grade]} words. "
            "Write 3 explanation sentences and 3 practice questions with 2–4 options each. "
            "The activity must not need printing or devices unless they are available.\n"
            + ("This is a fractions lesson: give practice options a \"fraction\" picture like "
               "{\"parts\": 4, \"shaded\": 1} where it helps.\n" if fractions else "Set \"fraction\" to null.\n")
            + (f"Style: {STYLES[style]}\n" if style in STYLES else "")
            + (f"The learner loves {', '.join(interests)}: use these in the example and questions.\n" if interests else "")
            + (f"Your previous version was rejected. Fix these problems: {' | '.join(fix)}\n" if fix else "")
            + f"\nShape:\n{SHAPE}"
        )
        material, completion, ms = self.call(
            llm, trace, prompt, LearnerMaterial,
            context={"request": req.model_dump(), "analysis": analysis.model_dump(),
                     "learner": learner.model_dump() if learner else None, "attempt": attempt, "style": style},
        )
        self.output(trace, f"Material ready for {who}: \"{material.title}\"",
                    f"{len(material.explanation)}-sentence explanation, activity and {len(material.practice)} practice questions",
                    {"material": material.model_dump(exclude_none=True)}, completion, ms)
        return material
