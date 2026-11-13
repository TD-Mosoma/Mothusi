"""Run the Grade 4 fractions demo from the terminal and print the agent timeline.

    uv run python -m scripts.demo            # live model if NVIDIA_API_KEY is set
    uv run python -m scripts.demo --offline  # offline demo model
"""

import argparse
import json

from config import load_settings
from llm.client import build_client
from models.schemas import LessonRequest
from orchestration.events import Event, RunTrace
from orchestration.workflow import Orchestrator
from storage.database import Store

DEMO = {
    "grade": "Grade 4",
    "subject": "Mathematics",
    "topic": "Fractions",
    "objectives": "Recognise, name and represent halves and quarters of a whole.",
    "content": "Introduce halves and quarters by sharing food, then use drawings and real objects.",
    "learners": [
        {"id": "lr1", "code": "L-001", "name": "Learner A", "strengths": "Visual thinking", "support": "Visual explanations and diagrams"},
        {"id": "lr2", "code": "L-002", "name": "Learner B", "strengths": "Likes routine", "support": "Short, structured instructions"},
        {"id": "lr3", "code": "L-003", "name": "Learner C", "strengths": "Enjoys discussion", "support": "Practical examples", "language": "tn"},
    ],
    "constraints": {"class_size": 40, "lesson_minutes": 45, "support_minutes": 5, "has_printer": False},
}


def show(event: Event) -> None:
    print(f"{event.ts[11:23]}  +{event.elapsed_ms / 1000:6.1f}s  {event.agent:<22} {event.type:<14} {event.title}")
    if event.detail and event.type in {"check_failed", "decision", "warning", "run_failed", "plan"}:
        for line in event.detail.splitlines():
            print(f"{'':49}{line}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    settings = load_settings()
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    llm = build_client(settings, offline=args.offline)
    trace = RunTrace("demo", on_event=show)
    print(f"Model: {llm.label}\n")
    result = Orchestrator(settings, Store(settings.db_path)).plan_lesson(trace, llm, LessonRequest.model_validate(DEMO))
    print("\n" + result["pack"]["markdown"])
    print("\nStats:", json.dumps(result["pack"]["stats"]))


if __name__ == "__main__":
    main()
