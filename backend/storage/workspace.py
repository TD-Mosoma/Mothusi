"""A teacher's own workspace (classes, learner profiles, lesson plans), stored on the server so it follows the
teacher to any device. Each record is a JSON document owned by exactly one teacher."""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from storage.db import connect

KINDS = ("classes", "profiles", "lessons")
MAX_DOC_BYTES = 1_500_000

SCHEMA = """
CREATE TABLE IF NOT EXISTS workspace_docs (
    teacher_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    class_id TEXT,
    body TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_at TEXT,
    PRIMARY KEY (teacher_id, kind, id)
);
CREATE INDEX IF NOT EXISTS workspace_class ON workspace_docs (teacher_id, kind, class_id);
"""


class WorkspaceStore:
    def __init__(self, path: Path | str):
        self.db = connect(path)
        self.db.create(SCHEMA.split("CREATE INDEX")[0])
        # Records keep the order they were created in. Older databases relied on SQLite's hidden row number.
        self.db.add_column("workspace_docs", "created_at TEXT")
        self.db.run("UPDATE workspace_docs SET created_at = updated_at WHERE created_at IS NULL")
        self.db.create("CREATE INDEX" + SCHEMA.split("CREATE INDEX")[1])

    def load(self, teacher_id: str) -> dict[str, list[dict[str, Any]]]:
        rows = self.db.all(
            "SELECT kind, body FROM workspace_docs WHERE teacher_id = ? ORDER BY created_at, id", (teacher_id,))
        out: dict[str, list[dict[str, Any]]] = {kind: [] for kind in KINDS}
        for row in rows:
            out[row["kind"]].append(json.loads(row["body"]))
        return out

    def put(self, teacher_id: str, kind: str, doc_id: str, body: dict[str, Any]) -> dict[str, Any]:
        body = {**body, "id": doc_id}
        raw = json.dumps(body, default=str)
        if len(raw) > MAX_DOC_BYTES:
            raise ValueError("This record is too large to save.")
        class_id = body.get("classId") if kind != "classes" else doc_id
        now = datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
        self.db.run(
            "INSERT INTO workspace_docs (teacher_id, kind, id, class_id, body, updated_at, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)"
            " ON CONFLICT (teacher_id, kind, id) DO UPDATE SET class_id = excluded.class_id, body = excluded.body,"
            " updated_at = excluded.updated_at",  # created_at is kept, so the record keeps its place in its list
            (teacher_id, kind, doc_id, class_id, raw, now, now),
        )
        return body

    def get(self, teacher_id: str, kind: str, doc_id: str) -> dict[str, Any] | None:
        row = self.db.one("SELECT body FROM workspace_docs WHERE teacher_id = ? AND kind = ? AND id = ?",
                          (teacher_id, kind, doc_id))
        return json.loads(row["body"]) if row else None

    def delete(self, teacher_id: str, kind: str, doc_id: str) -> bool:
        return self.db.run("DELETE FROM workspace_docs WHERE teacher_id = ? AND kind = ? AND id = ?",
                           (teacher_id, kind, doc_id)) > 0

    def profiles_in_class(self, teacher_id: str, class_id: str) -> list[dict[str, Any]]:
        rows = self.db.all(
            "SELECT body FROM workspace_docs WHERE teacher_id = ? AND kind = 'profiles' AND class_id = ?"
            " ORDER BY created_at, id",
            (teacher_id, class_id),
        )
        return [json.loads(r["body"]) for r in rows]
