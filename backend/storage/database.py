import json
from pathlib import Path
from typing import Any

from orchestration.events import Event, utc_now
from storage.db import connect

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    finished_at TEXT,
    parent_run_id TEXT,
    lesson_id TEXT,
    model TEXT,
    request_json TEXT NOT NULL,
    result_json TEXT,
    error TEXT,
    approved_at TEXT,
    owner_id TEXT,
    class_id TEXT,
    job_json TEXT,
    claimed_at TEXT
);
CREATE TABLE IF NOT EXISTS events (
    run_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    event_json TEXT NOT NULL,
    PRIMARY KEY (run_id, seq)
);
CREATE TABLE IF NOT EXISTS feedback (
    id {ID},
    created_at TEXT NOT NULL,
    lesson_id TEXT,
    run_id TEXT,
    grade TEXT,
    subject TEXT,
    topic TEXT,
    learner_id TEXT NOT NULL,
    learner_label TEXT,
    adaptation_id TEXT,
    strategy TEXT,
    instruction TEXT,
    outcome TEXT NOT NULL,
    note TEXT,
    teacher_id TEXT
);
CREATE INDEX IF NOT EXISTS feedback_learner ON feedback (learner_id);
"""

# Columns added after the first release; older databases are upgraded in place.
MIGRATIONS = {"runs": ["owner_id TEXT", "class_id TEXT", "job_json TEXT", "claimed_at TEXT"], "feedback": ["teacher_id TEXT"]}


class Store:
    def __init__(self, path: Path | str):
        self.db = connect(path)
        self.db.create(SCHEMA)
        for table, columns in MIGRATIONS.items():
            for column in columns:
                self.db.add_column(table, column)
        self.db.create("CREATE INDEX IF NOT EXISTS runs_owner ON runs (owner_id, created_at)")

    # ------------------------------------------------------------ runs

    def create_run(self, *, run_id: str, kind: str, title: str, request: dict, model: str,
                   parent_run_id: str | None = None, lesson_id: str | None = None,
                   owner_id: str | None = None, class_id: str | None = None, job: dict | None = None,
                   claimed: bool = True) -> None:
        now = utc_now()
        self.db.run(
            "INSERT INTO runs (id, kind, status, title, created_at, parent_run_id, lesson_id, model, request_json,"
            " owner_id, class_id, job_json, claimed_at) VALUES (?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (run_id, kind, title, now, parent_run_id, lesson_id, model, json.dumps(request), owner_id, class_id,
             json.dumps(job) if job is not None else None, now if claimed else None),
        )

    def claim_run(self, run_id: str) -> bool:
        """Mark a saved run as started. Only the first caller wins, so a run never executes twice."""
        return self.db.run("UPDATE runs SET claimed_at = ? WHERE id = ? AND status = 'running' AND claimed_at IS NULL",
                           (utc_now(), run_id)) > 0

    def run_status(self, run_id: str) -> str | None:
        row = self.db.one("SELECT status FROM runs WHERE id = ?", (run_id,))
        return row["status"] if row else None

    def expire_stale_runs(self, unclaimed_before: str, claimed_before: str) -> int:
        """Runs that never started, or started but stopped reporting (the server or browser went away)."""
        return self.db.run(
            "UPDATE runs SET status = 'failed', finished_at = ?, error = ? WHERE status = 'running' AND"
            " ((claimed_at IS NULL AND created_at < ?) OR (claimed_at IS NOT NULL AND claimed_at < ?))",
            (utc_now(), "This run stopped before it finished. Please try again.", unclaimed_before, claimed_before),
        )

    def fail_if_running(self, run_id: str, message: str) -> bool:
        return self.db.run("UPDATE runs SET status = 'failed', finished_at = ?, error = ? WHERE id = ? AND status = 'running'",
                           (utc_now(), message, run_id)) > 0

    def finish_run(self, run_id: str, status: str, result: dict | None = None, error: str | None = None) -> None:
        self.db.run(
            "UPDATE runs SET status = ?, finished_at = ?, result_json = ?, error = ? WHERE id = ?",
            (status, utc_now(), json.dumps(result) if result is not None else None, error, run_id),
        )

    def approve_run(self, run_id: str) -> bool:
        return self.db.run("UPDATE runs SET approved_at = ? WHERE id = ? AND result_json IS NOT NULL",
                           (utc_now(), run_id)) > 0

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        row = self.db.one("SELECT * FROM runs WHERE id = ?", (run_id,))
        return _run_row(row) if row else None

    def list_runs(self, owner_id: str, limit: int = 50) -> list[dict[str, Any]]:
        rows = self.db.all(
            "SELECT r.*, (SELECT COUNT(*) FROM events e WHERE e.run_id = r.id) AS event_count"
            " FROM runs r WHERE r.owner_id = ? ORDER BY r.created_at DESC LIMIT ?",
            (owner_id, limit),
        )
        out = []
        for row in rows:
            run = _run_row(row, include_payload=False)
            run["event_count"] = int(row["event_count"])
            out.append(run)
        return out

    def approved_plans(self, owner_id: str, class_id: str | None, limit: int = 20) -> list[dict[str, Any]]:
        """Approved lesson plans from one teacher for one class, newest approval first."""
        rows = self.db.all(
            "SELECT * FROM runs WHERE kind IN ('plan', 'replan') AND approved_at IS NOT NULL"
            " AND owner_id = ? AND class_id IS NOT DISTINCT FROM ? ORDER BY approved_at DESC LIMIT ?",
            (owner_id, class_id, limit),
        )
        return [_run_row(r) for r in rows]

    def mark_interrupted_runs(self) -> None:
        self.db.run(
            "UPDATE runs SET status = 'failed', error = 'The server stopped before this run finished.',"
            " finished_at = ? WHERE status = 'running'",
            (utc_now(),),
        )

    # ------------------------------------------------------------ events

    def add_event(self, event: Event) -> None:
        self.db.run(
            "INSERT INTO events (run_id, seq, event_json) VALUES (?, ?, ?)"
            " ON CONFLICT (run_id, seq) DO UPDATE SET event_json = excluded.event_json",
            (event.run_id, event.seq, event.model_dump_json()),
        )

    def events_since(self, run_id: str, after_seq: int) -> list[Event]:
        rows = self.db.all("SELECT event_json FROM events WHERE run_id = ? AND seq > ? ORDER BY seq", (run_id, after_seq))
        return [Event.model_validate_json(r["event_json"]) for r in rows]

    def events(self, run_id: str) -> list[Event]:
        rows = self.db.all("SELECT event_json FROM events WHERE run_id = ? ORDER BY seq", (run_id,))
        return [Event.model_validate_json(r["event_json"]) for r in rows]

    # ------------------------------------------------------------ feedback memory

    FEEDBACK_COLUMNS = ("created_at", "lesson_id", "run_id", "grade", "subject", "topic", "learner_id", "learner_label",
                        "adaptation_id", "strategy", "instruction", "outcome", "note", "teacher_id")

    def add_feedback(self, rows: list[dict[str, Any]]) -> None:
        now = utc_now()
        cols = self.FEEDBACK_COLUMNS
        values = [tuple({"created_at": now, "teacher_id": None, **r}.get(c) for c in cols) for r in rows]
        with self.db.tx() as t:
            t.executemany(f"INSERT INTO feedback ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})", values)

    def feedback_for(self, learner_ids: list[str], teacher_id: str | None, limit: int = 40) -> list[dict[str, Any]]:
        """Feedback a teacher gave about their own learners. Learner ids are only unique within one teacher."""
        if not learner_ids:
            return []
        marks = ",".join("?" for _ in learner_ids)
        return self.db.all(
            f"SELECT * FROM feedback WHERE learner_id IN ({marks}) AND teacher_id IS NOT DISTINCT FROM ?"
            " ORDER BY created_at DESC, id DESC LIMIT ?",
            (*learner_ids, teacher_id, limit),
        )


def _run_row(row: dict[str, Any], include_payload: bool = True) -> dict[str, Any]:
    run = {
        "id": row["id"],
        "kind": row["kind"],
        "status": row["status"],
        "title": row["title"],
        "created_at": row["created_at"],
        "finished_at": row["finished_at"],
        "parent_run_id": row["parent_run_id"],
        "lesson_id": row["lesson_id"],
        "model": row["model"],
        "error": row["error"],
        "approved_at": row["approved_at"],
        "owner_id": row["owner_id"],
        "class_id": row["class_id"],
    }
    if include_payload:
        run["job"] = json.loads(row["job_json"]) if row.get("job_json") else None
        run["request"] = json.loads(row["request_json"])
        run["result"] = json.loads(row["result_json"]) if row["result_json"] else None
    return run
