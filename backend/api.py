import importlib.util
import os
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from dotenv import load_dotenv


load_dotenv()
app = FastAPI(title="Mothusi API", version="0.1.0")


class LearnerProfile(BaseModel):
    name: str = Field(default="Learner", min_length=1, max_length=120)
    preference: str = Field(default="", max_length=1000)


class LessonConstraints(BaseModel):
    individual_time_minutes: int = Field(default=5, ge=0, le=240)
    has_printer: bool = True
    noisy_hall: bool = False
    class_size: int = Field(default=1, ge=1, le=1000)
    lesson_minutes: int = Field(default=45, ge=10, le=600)


class GenerateLessonRequest(BaseModel):
    lesson_plan: str = Field(min_length=5, max_length=12000)
    profiles: list[LearnerProfile] = Field(default_factory=list, max_length=100)
    constraints: LessonConstraints = Field(default_factory=LessonConstraints)


@app.get("/api/health")
def health() -> dict[str, str]:
    if os.getenv("MOTHUSI_DEMO_MODE", "").lower() == "true":
        generator = "demo"
    elif not os.getenv("NVIDIA_API_KEY"):
        generator = "unconfigured"
    elif importlib.util.find_spec("crewai") is None:
        generator = "dependencies_missing"
    else:
        generator = "ready"
    return {"status": "ok", "generator": generator}


def _make_demo_result(request: GenerateLessonRequest) -> dict[str, Any]:
    adaptations = []
    for profile in request.profiles:
        learner = profile.name
        support = profile.preference or "clear, sequenced instructions"
        adaptations.append({
            "learner": learner,
            "recommendation": f"For {learner}, use {support} while teaching the lesson objective.",
            "time_required_minutes": min(
                2, request.constraints.individual_time_minutes
            ),
            "materials_needed": ["Board and chalk"] if not request.constraints.has_printer else [],
        })

    if not adaptations:
        adaptations.append({
            "learner": "Whole class",
            "recommendation": "Model the lesson objective with a worked example, then check understanding.",
            "time_required_minutes": min(
                2, request.constraints.individual_time_minutes
            ),
            "materials_needed": ["Board and chalk"] if not request.constraints.has_printer else [],
        })

    pack = "\n".join(
        ["# Local demo teacher-support pack", ""]
        + [
            f"## {item['learner']}\n{item['recommendation']}\n"
            f"Time: {item['time_required_minutes']} minutes."
            for item in adaptations
        ]
    )
    return {
        "pack": pack,
        "adaptations": {"adaptations": adaptations},
        "attempts": 1,
        "final_feedback": "",
        "review_passed": True,
        "mode": "demo",
    }


@app.post("/api/lessons/generate")
async def generate_lesson(request: GenerateLessonRequest) -> dict[str, Any]:
    if os.getenv("MOTHUSI_DEMO_MODE", "").lower() == "true":
        return _make_demo_result(request)

    if not os.getenv("NVIDIA_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="Lesson generation is not configured. Set NVIDIA_API_KEY, or enable MOTHUSI_DEMO_MODE for a local demo.",
        )
    if importlib.util.find_spec("crewai") is None:
        raise HTTPException(
            status_code=503,
            detail="CrewAI is not installed. Install the backend dependencies before generating lessons.",
        )

    from main import run_mothusi

    result = await run_in_threadpool(
        run_mothusi,
        request.lesson_plan,
        [profile.model_dump() for profile in request.profiles],
        request.constraints.model_dump(),
    )

    return {**result, "review_passed": not result["final_feedback"], "mode": "ai"}
