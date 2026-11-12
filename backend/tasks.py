from crewai import Task
from models import LessonAnalysis, AdaptationList, ReviewResult


def make_analysis_task(lesson_plan: str, profiles: list, constraints: dict):
    return Task(
        description=(
            f"Analyze this lesson plan and identify its learning demands.\n\n"
            f"Lesson plan:\n{lesson_plan}\n\n"
            f"Learner support profiles:\n{profiles}\n\n"
            f"Classroom constraints:\n{constraints}\n\n"
            f"Return a structured list of learning demands."
        ),
        expected_output="LessonAnalysis with learning_demands and objective_summary",
        output_pydantic=LessonAnalysis,
        agent=lesson_analyst,  # imported below to avoid circular import
    )


def make_design_task(analysis, constraints: dict, feedback: str = ""):
    feedback_clause = ""
    if feedback:
        feedback_clause = (
            f"\n\nPREVIOUS ATTEMPT WAS REJECTED. You MUST fix these issues:\n{feedback}\n"
            f"Do not repeat the same mistake."
        )
    return Task(
        description=(
            f"Design classroom adaptations for these learning demands:\n"
            f"{analysis.learning_demands}\n\n"
            f"Teacher constraints (MUST respect):\n{constraints}\n"
            f"{feedback_clause}\n\n"
            f"Return a structured list of adaptations. "
            f"Each adaptation MUST have a time_required_minutes value that does not exceed "
            f"the teacher's individual_time_minutes constraint."
        ),
        expected_output="AdaptationList with adaptations",
        output_pydantic=AdaptationList,
        agent=adaptation_designer,
    )


def make_llm_review_task(adaptations, analysis):
    return Task(
        description=(
            f"Review these adaptations for relevance and alignment with the lesson objective.\n\n"
            f"Objective: {analysis.objective_summary}\n"
            f"Adaptations: {adaptations.model_dump_json()}\n\n"
            f"Only check: are these adaptations relevant and do they help achieve the objective? "
            f"Do NOT check time constraints."
        ),
        expected_output="ReviewResult with passed and feedback",
        output_pydantic=ReviewResult,
        agent=reviewer_agent,
    )


def make_pack_task(adaptations, constraints: dict):
    return Task(
        description=(
            f"Build a teacher-support Markdown document from these approved adaptations.\n\n"
            f"Adaptations: {adaptations.model_dump_json()}\n"
            f"Classroom constraints: {constraints}\n\n"
            f"Format: a clear heading, then one section per learner with the recommendation "
            f"and time required. Keep it concise and practical."
        ),
        expected_output="A Markdown teacher-support pack",
        agent=pack_builder,
    )


# Import agents at the bottom to avoid circular dependency
from agents import lesson_analyst, adaptation_designer, reviewer_agent, pack_builder