import os
from dotenv import load_dotenv

load_dotenv()

from crewai import Crew, Process
from tasks import (
    make_analysis_task, make_design_task,
    make_llm_review_task, make_pack_task,
)
from reviewer import check_time_constraints

MAX_RETRIES = 3


def run_mothusi(lesson_plan: str, profiles: list, constraints: dict) -> dict:
    # ---- Step 1: Lesson Analysis ----
    analysis_task = make_analysis_task(lesson_plan, profiles, constraints)
    analysis_crew = Crew(
        agents=[analysis_task.agent], tasks=[analysis_task],
        process=Process.sequential, verbose=True,
    )
    analysis = analysis_crew.kickoff().pydantic

    # ---- Step 2: Design → Review loop ----
    feedback = ""
    final_adaptations = None
    attempts = 0
    review_passed = False

    for attempt in range(MAX_RETRIES):
        attempts = attempt + 1

        # Design
        design_task = make_design_task(analysis, constraints, feedback)
        design_crew = Crew(
            agents=[design_task.agent], tasks=[design_task],
            process=Process.sequential, verbose=True,
        )
        adaptations = design_crew.kickoff().pydantic

        # Review 1: Code-level time check (deterministic)
        time_ok, time_feedback = check_time_constraints(adaptations, constraints)
        if not time_ok:
            feedback = time_feedback
            print(f"\n[Attempt {attempts}] Time check FAILED: {time_feedback}\n")
            continue

        # Review 2: LLM relevance check
        review_task = make_llm_review_task(adaptations, analysis)
        review_crew = Crew(
            agents=[review_task.agent], tasks=[review_task],
            process=Process.sequential, verbose=True,
        )
        review = review_crew.kickoff().pydantic

        if not review.passed:
            feedback = review.feedback
            print(f"\n[Attempt {attempts}] LLM review FAILED: {feedback}\n")
            continue

        final_adaptations = adaptations
        feedback = ""
        review_passed = True
        print(f"\n[Attempt {attempts}] PASSED both checks.\n")
        break

    if final_adaptations is None:
        final_adaptations = adaptations
        feedback = f"Max retries reached. Last feedback: {feedback}"

    # ---- Step 3: Pack Builder ----
    pack_task = make_pack_task(final_adaptations, constraints)
    pack_crew = Crew(
        agents=[pack_task.agent], tasks=[pack_task],
        process=Process.sequential, verbose=True,
    )
    pack = pack_crew.kickoff().raw

    return {
        "pack": pack,
        "adaptations": final_adaptations.model_dump(),
        "attempts": attempts,
        "final_feedback": feedback,
        "review_passed": review_passed,
    }


if __name__ == "__main__":
    result = run_mothusi(
        lesson_plan=(
            "Grade 4 Mathematics: Introduction to fractions. Learners must understand halves "
            "and quarters using visual representations."
        ),
        profiles=[
            {"name": "Learner A", "preference": "Visual explanations and diagrams"},
            {"name": "Learner B", "preference": "Short, structured instructions"},
            {"name": "Learner C", "preference": "Practical examples and Setswana explanations"},
        ],
        constraints={
            "individual_time_minutes": 5,
            "has_printer": False,
            "class_size": 40,
        },
    )
    print("\n=== FINAL PACK ===\n")
    print(result["pack"])
    print(f"\nAttempts: {result['attempts']}")
    print(f"Last feedback: {result['final_feedback']}")
