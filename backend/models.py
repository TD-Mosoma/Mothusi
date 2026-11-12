from pydantic import BaseModel, Field
from typing import List


class LessonAnalysis(BaseModel):
    """Lesson Analyst's output"""
    learning_demands: List[str] = Field(
        description="List of learning demands in the lesson, e.g. reading, writing, listening, transitions, group work"
    )
    objective_summary: str = Field(description="One-sentence summary of the lesson objectives")


class Adaptation(BaseModel):
    """Single adaptation recommendation"""
    learner: str = Field(description="Learner identifier, e.g. Learner A, Learner B")
    recommendation: str = Field(description="Specific classroom adaptation recommendation")
    time_required_minutes: int = Field(description="Teacher time required to implement this recommendation (minutes)")
    materials_needed: List[str] = Field(default_factory=list, description="Materials needed")


class AdaptationList(BaseModel):
    """Adaptation Designer's output"""
    adaptations: List[Adaptation]


class ReviewResult(BaseModel):
    """Reviewer's LLM review result (only for relevance and objective alignment)"""
    passed: bool
    feedback: str = Field(description="If rejected, explain why; if passed, briefly confirm")