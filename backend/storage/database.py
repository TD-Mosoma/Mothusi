import json
import sqlite3
import threading
from pathlib import Path
from typing import Any

from orchestration.events import Event, utc_now

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
    approved_at TEXT
);
CREATE TABLE IF NOT EXISTS events (
    run_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    event_json TEXT NOT NULL,
    PRIMARY KEY (run_id, seq)
);
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    note TEXT
);
CREATE INDEX IF NOT EXISTS feedback_learner ON feedback (learner_id);
"""


class Store:
    def __init__(self, path: Path | str):
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock, self._conn:
            self._conn.executescript(SCHEMA)

    # ------------------------------------------------------------ runs

    def create_run(self, *, run_id: str, kind: str, title: str, request: dict, model: str,
                   parent_run_id: str | None = None, lesson_id: str | None = None) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO runs (id, kind, status, title, created_at, parent_run_id, lesson_id, model, request_json)"
                " VALUES (?, ?, 'running', ?, ?, ?, ?, ?, ?)",
                (run_id, kind, title, utc_now(), parent_run_id, lesson_id, model, json.dumps(request)),
            )

    def finish_run(self, run_id: str, status: str, result: dict | None = None, error: str | None = None) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "UPDATE runs SET status = ?, finished_at = ?, result_json = ?, error = ? WHERE id = ?",
                (status, utc_now(), json.dumps(result) if result is not None else None, error, run_id),
            )

    def approve_run(self, run_id: str) -> bool:
        with self._lock, self._conn:
            cur = self._conn.execute(
                "UPDATE runs SET approved_at = ? WHERE id = ? AND result_json IS NOT NULL", (utc_now(), run_id)
            )
            return cur.rowcount > 0

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        return _run_row(row) if row else None

    def list_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT r.*, (SELECT COUNT(*) FROM events e WHERE e.run_id = r.id) AS event_count"
                " FROM runs r ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        out = []
        for row in rows:
            run = _run_row(row, include_payload=False)
            run["event_count"] = row["event_count"]
            out.append(run)
        return out

    def approved_plans(self, limit: int = 20) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM runs WHERE kind IN ('plan', 'replan') AND approved_at IS NOT NULL"
                " ORDER BY approved_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [_run_row(r) for r in rows]

    def latest_approved_plan(self) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM runs WHERE kind IN ('plan', 'replan') AND approved_at IS NOT NULL"
                " ORDER BY approved_at DESC LIMIT 1"
            ).fetchone()
        return _run_row(row) if row else None

    def mark_interrupted_runs(self) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "UPDATE runs SET status = 'failed', error = 'The server stopped before this run finished.',"
                " finished_at = ? WHERE status = 'running'",
                (utc_now(),),
            )

    # ------------------------------------------------------------ events

    def add_event(self, event: Event) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT OR REPLACE INTO events (run_id, seq, event_json) VALUES (?, ?, ?)",
                (event.run_id, event.seq, event.model_dump_json()),
            )

    def events(self, run_id: str) -> list[Event]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT event_json FROM events WHERE run_id = ? ORDER BY seq", (run_id,)
            ).fetchall()
        return [Event.model_validate_json(r["event_json"]) for r in rows]

    # ------------------------------------------------------------ feedback memory

    def add_feedback(self, rows: list[dict[str, Any]]) -> None:
        now = utc_now()
        with self._lock, self._conn:
            self._conn.executemany(
                "INSERT INTO feedback (created_at, lesson_id, run_id, grade, subject, topic, learner_id, learner_label,"
                " adaptation_id, strategy, instruction, outcome, note)"
                " VALUES (:created_at, :lesson_id, :run_id, :grade, :subject, :topic, :learner_id, :learner_label,"
                " :adaptation_id, :strategy, :instruction, :outcome, :note)",
                [{"created_at": now, **r} for r in rows],
            )

    def feedback_for(self, learner_ids: list[str], limit: int = 40) -> list[dict[str, Any]]:
        if not learner_ids:
            return []
        marks = ",".join("?" for _ in learner_ids)
        with self._lock:
            rows = self._conn.execute(
                f"SELECT * FROM feedback WHERE learner_id IN ({marks}) ORDER BY created_at DESC LIMIT ?",
                (*learner_ids, limit),
            ).fetchall()
        return [dict(r) for r in rows]


def _run_row(row: sqlite3.Row, include_payload: bool = True) -> dict[str, Any]:
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
    }
    if include_payload:
        run["request"] = json.loads(row["request_json"])
        run["result"] = json.loads(row["result_json"]) if row["result_json"] else None
    return run
