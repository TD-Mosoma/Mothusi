from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from models.curriculum import GRADES, LANGUAGES, SUBJECTS_BY_GRADE

LanguageCode = Literal["en", "tn", "zu", "xh", "af", "st", "ve", "nso", "nr", "ss", "ts"]
WHOLE_CLASS = "whole_class"


# ---------------------------------------------------------------- teacher input

class LearnerProfile(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    code: str | None = Field(default=None, max_length=32)
    name: str = Field(min_length=1, max_length=60, description="Name or label, e.g. Learner A")
    strengths: str = Field(default="", max_length=400)
    support: str = Field(default="", max_length=400, description="Support that has helped this learner")
    language: LanguageCode = Field(default="en", description="Learning language chosen by the teacher or learner")


class ClassroomConstraints(BaseModel):
    class_size: int = Field(ge=1, le=80)
    lesson_minutes: int = Field(ge=10, le=120)
    support_minutes: int = Field(ge=0, le=60, description="Total one-to-one teacher time available in the lesson")
    prep_minutes: int = Field(default=30, ge=0, le=240, description="Time the teacher has to prepare before the lesson")
    has_printer: bool = False
    has_devices: bool = False
    noisy_venue: bool = False
    notes: str = Field(default="", max_length=400)


class LessonRequest(BaseModel):
    grade: str
    subject: str
    topic: str = Field(min_length=2, max_length=120)
    objectives: str = Field(min_length=5, max_length=800)
    content: str = Field(default="", max_length=6000)
    learners: list[LearnerProfile] = Field(default_factory=list, max_length=15)
    constraints: ClassroomConstraints
    lesson_id: str | None = Field(default=None, max_length=64)
    offline: bool = Field(default=False, description="Use the offline demo model instead of the live model")

    @model_validator(mode="after")
    def _in_scope(self):
        if self.grade not in GRADES:
            raise ValueError(f"Mothusi currently supports {', '.join(GRADES)}.")
        if self.subject not in SUBJECTS_BY_GRADE[self.grade]:
            raise ValueError(f"{self.subject} is not a CAPS subject for {self.grade}.")
        ids = [l.id for l in self.learners]
        if len(ids) != len(set(ids)):
            raise ValueError("Each learner profile needs a unique id.")
        return self


class ReplanRequest(BaseModel):
    constraints: ClassroomConstraints | None = None
    teacher_note: str = Field(default="", max_length=600)
    lesson_id: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def _has_change(self):
        if self.constraints is None and not self.teacher_note.strip():
            raise ValueError("Change a classroom condition or tell Mothusi what to change.")
        return self


# ---------------------------------------------------------------- agent outputs

DemandKind = Literal[
    "listening", "speaking", "reading", "writing", "visual", "hands_on", "number_work",
    "group_work", "transitions", "sustained_attention", "fine_motor", "new_vocabulary", "other",
]
_DEMAND_ALIASES = {
    "counting": "number_work", "maths": "number_work", "math": "number_work", "calculation": "number_work",
    "practical": "hands_on", "manipulatives": "hands_on", "movement": "hands_on",
    "attention": "sustained_attention", "focus": "sustained_attention", "vocabulary": "new_vocabulary",
    "drawing": "fine_motor", "oral": "speaking", "discussion": "speaking", "pair_work": "group_work",
}


class LessonDemand(BaseModel):
    kind: DemandKind
    description: str = Field(min_length=3)
    phase: str = Field(default="", description="Lesson phase where the demand appears")
    load: Literal["low", "medium", "high"] = "medium"

    @field_validator("kind", mode="before")
    @classmethod
    def _norm_kind(cls, v):
        key = str(v).strip().lower().replace(" ", "_").replace("-", "_")
        key = _DEMAND_ALIASES.get(key, key)
        return key if key in DemandKind.__args__ else "other"

    @field_validator("load", mode="before")
    @classmethod
    def _norm_load(cls, v):
        key = str(v).strip().lower()
        return key if key in {"low", "medium", "high"} else "medium"


class FlowPhase(BaseModel):
    label: str = Field(min_length=2, max_length=60)
    minutes: int = Field(ge=1, le=120)
    activity: str = Field(default="", max_length=400)


class LessonAnalysis(BaseModel):
    objective_summary: str = Field(min_length=5)
    success_criteria: list[str] = Field(min_length=1, max_length=5)
    key_vocabulary: list[str] = Field(default_factory=list, max_length=12)
    demands: list[LessonDemand] = Field(min_length=2, max_length=12)
    flow: list[FlowPhase] = Field(min_length=3, max_length=7)


class SupportNeed(BaseModel):
    learner_id: str
    demand: str = Field(description="The lesson demand that may create a barrier")
    barrier: str = Field(description="What may be hard, in strengths-based wording")
    leverage: str = Field(description="Strength or known strategy to build on")
    priority: Literal["high", "medium", "low"] = "medium"

    @field_validator("priority", mode="before")
    @classmethod
    def _norm_priority(cls, v):
        key = str(v).strip().lower()
        return key if key in {"high", "medium", "low"} else "medium"


class NeedsMatch(BaseModel):
    needs: list[SupportNeed] = Field(default_factory=list)
    whole_class_considerations: list[str] = Field(default_factory=list, max_length=6)


class DraftAdaptation(BaseModel):
    learner_id: str
    phase: str = Field(default="", max_length=60)
    strategy: str = Field(min_length=3, max_length=90)
    instruction: str = Field(min_length=10, max_length=600)
    teacher_minutes: int = Field(ge=0, le=120, description="One-to-one teacher time this needs")
    prep_minutes: int = Field(default=0, ge=0, le=240, description="Teacher preparation time before the lesson")
    materials: list[str] = Field(default_factory=list, max_length=8)
    addresses: str = Field(default="", max_length=300)
    replaces: str | None = Field(default=None, description="Id of the adaptation this revision replaces")


class AdaptationPlan(BaseModel):
    adaptations: list[DraftAdaptation] = Field(min_length=1, max_length=20)


class DesignerTurn(AdaptationPlan):
    """One step of the Designer's tool loop: test a draft with the check_plan tool, or submit it."""
    action: Literal["check", "submit"] = "submit"
    note: str = Field(default="", max_length=400)

    @field_validator("action", mode="before")
    @classmethod
    def _norm_action(cls, v):
        return "check" if str(v).strip().lower() in {"check", "check_plan", "tool", "use_tool"} else "submit"


class LearnerPriority(BaseModel):
    learner_id: str
    focus: str = Field(default="", max_length=200)
    priority: Literal["high", "medium", "low"] = "medium"

    @field_validator("priority", mode="before")
    @classmethod
    def _norm_priority(cls, v):
        key = str(v).strip().lower()
        return key if key in {"high", "medium", "low"} else "medium"


class WorkPlan(BaseModel):
    """The Orchestrator's own plan for a lesson, decided by the model and then checked by guardrails."""
    summary: str = Field(min_length=5, max_length=600)
    priorities: list[LearnerPriority] = Field(default_factory=list, max_length=15)
    personalise_for: list[str] = Field(default_factory=list, max_length=15)
    design_guidance: str = Field(default="", max_length=600)
    risks: list[str] = Field(default_factory=list, max_length=5)


class RouteDecision(BaseModel):
    """Where the Orchestrator sends work after the Reviewer rejects it."""
    route: Literal["designer", "analyst", "teacher"] = "designer"
    reason: str = Field(default="", max_length=500)
    guidance: str = Field(default="", max_length=500)

    @field_validator("route", mode="before")
    @classmethod
    def _norm_route(cls, v):
        key = str(v).strip().lower()
        if "analy" in key:
            return "analyst"
        if "teacher" in key or "escalat" in key:
            return "teacher"
        return "designer"


class Adaptation(DraftAdaptation):
    id: str
    revision: int = 1


class AdaptationVerdict(BaseModel):
    adaptation_id: str
    approved: bool
    reason: str = ""


class QualityReview(BaseModel):
    verdicts: list[AdaptationVerdict] = Field(default_factory=list)
    objective_preserved: bool = True
    summary: str = ""


class OptionVisual(BaseModel):
    parts: int = Field(ge=1, le=12)
    shaded: int = Field(ge=0, le=12)

    @model_validator(mode="after")
    def _shaded_fits(self):
        if self.shaded > self.parts:
            raise ValueError("shaded cannot be more than parts")
        return self


class PracticeOption(BaseModel):
    text: str = Field(min_length=1, max_length=120)
    fraction: OptionVisual | None = None


class PracticeQuestion(BaseModel):
    prompt: str = Field(min_length=3, max_length=240)
    options: list[PracticeOption] = Field(min_length=2, max_length=4)
    answer_index: int = Field(ge=0)
    hint: str = Field(default="", max_length=240)

    @model_validator(mode="after")
    def _answer_exists(self):
        if self.answer_index >= len(self.options):
            raise ValueError("answer_index must point at one of the options")
        return self


class LearnerMaterial(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    explanation: list[str] = Field(min_length=2, max_length=6)
    everyday_example: str = Field(min_length=5, max_length=400)
    activity: str = Field(min_length=10, max_length=500)
    practice: list[PracticeQuestion] = Field(min_length=2, max_length=4)
    teacher_tip: str = Field(default="", max_length=300)


class Translation(BaseModel):
    translations: list[str]


class TranslationCheck(BaseModel):
    meaning_preserved: bool
    issues: list[str] = Field(default_factory=list)
    back_translation: str = ""


Outcome = Literal["Worked", "Partly worked", "Did not work"]


class AdaptationOutcome(BaseModel):
    adaptation_id: str
    learner_id: str
    learner_label: str = Field(default="", max_length=60)
    strategy: str = Field(default="", max_length=120)
    instruction: str = Field(default="", max_length=600)
    outcome: Outcome
    note: str = Field(default="", max_length=400)


class FeedbackRequest(BaseModel):
    run_id: str
    lesson_id: str | None = None
    overall: Literal["Worked well", "Partly worked", "Did not work"]
    happened: str = Field(default="", max_length=1000)
    change: str = Field(default="", max_length=1000)
    outcomes: list[AdaptationOutcome] = Field(default_factory=list, max_length=40)


class RecheckRequest(BaseModel):
    adaptations: list[Adaptation] = Field(min_length=1, max_length=30)


class ExplainRequest(BaseModel):
    run_id: str
    learner_code: str | None = Field(default=None, max_length=32)
    language: LanguageCode = "en"
    style: Literal["simpler", "visual", "practical"] = "simpler"
    interests: list[str] = Field(default_factory=list, max_length=3)

    @field_validator("interests")
    @classmethod
    def _short(cls, v):
        return [i.strip()[:30] for i in v if i.strip()]


def language_name(code: str) -> str:
    return LANGUAGES.get(code, code)
