import json
import os

import pytest

from config import Settings
from llm.client import Completion
from llm.mock import MockClient
from models.schemas import LessonRequest
from orchestration.events import RunTrace
from orchestration.workflow import Orchestrator
from storage.database import Store

DEMO = {
    "grade": "Grade 4",
    "subject": "Mathematics",
    "topic": "Fractions",
    "objectives": "Recognise, name and represent halves and quarters of a whole.",
    "learners": [
        {"id": "lr1", "code": "L-001", "name": "Learner A", "strengths": "Visual thinking", "support": "Visual explanations and diagrams"},
        {"id": "lr2", "code": "L-002", "name": "Learner B", "strengths": "Likes routine", "support": "Short, structured instructions"},
        {"id": "lr3", "code": "L-003", "name": "Learner C", "strengths": "Enjoys discussion", "support": "Practical examples", "language": "tn"},
    ],
    "constraints": {"class_size": 40, "lesson_minutes": 45, "support_minutes": 5, "has_printer": False},
}


# Set MOTHUSI_TEST_DATABASE_URL to a throwaway PostgreSQL database to run every test against PostgreSQL
# (the database Mothusi uses in production) instead of a temporary SQLite file. Its tables are emptied before each test.
TEST_DATABASE_URL = os.getenv("MOTHUSI_TEST_DATABASE_URL") or None
TABLES = ("runs", "events", "feedback", "accounts", "auth_sessions", "join_codes", "learner_links", "picture_logins",
          "password_resets", "workspace_docs", "learner_activity", "resources")


@pytest.fixture
def settings(tmp_path):
    if TEST_DATABASE_URL:
        from storage.db import connect
        db = connect(TEST_DATABASE_URL)
        existing = {r["table_name"] for r in db.all(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")}
        present = [t for t in TABLES if t in existing]
        if present:
            db.run(f"TRUNCATE {', '.join(present)} RESTART IDENTITY CASCADE")
    return Settings(provider="mock", api_key=None, base_url="", model="", language_model="", reasoning_tasks=frozenset(), temperature=0.0, timeout_seconds=5,
                    max_design_attempts=3, max_material_attempts=2, mock_delay_seconds=0.0,
                    db_path=tmp_path / "test.db", cors_origins=[], database_url=TEST_DATABASE_URL)


@pytest.fixture
def store(settings):
    return Store(settings.database)


@pytest.fixture
def orchestrator(settings, store):
    return Orchestrator(settings, store)


@pytest.fixture
def demo_request():
    return LessonRequest.model_validate(DEMO)


@pytest.fixture
def trace():
    return RunTrace("test")


@pytest.fixture
def mock_llm():
    return MockClient(delay_seconds=0)


class ScriptedLLM(MockClient):
    """Offline model with per-task overrides: a list of replies (str or dict) consumed in order."""

    live = True
    can_translate = True

    def __init__(self, **scripts):
        super().__init__(delay_seconds=0)
        self.scripts = {k: list(v) for k, v in scripts.items()}
        self.calls: list[str] = []

    def complete(self, messages, *, task, context, on_retry=None):
        self.calls.append(task)
        queue = self.scripts.get(task)
        if queue:
            reply = queue.pop(0) if len(queue) > 1 else queue[0]
            if callable(reply):
                reply = reply(context)
            return Completion(text=reply if isinstance(reply, str) else json.dumps(reply))
        return super().complete(messages, task=task, context=context, on_retry=on_retry)


def events_of(trace, type_):
    return [e for e in trace.events if e.type == type_]
