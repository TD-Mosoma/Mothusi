"""Teachers' uploaded teaching material, with its readable text, kept on the server per teacher."""

import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from storage.db import connect

SCHEMA = """
CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    title TEXT NOT NULL,
    grade TEXT NOT NULL,
    subject TEXT NOT NULL,
    type TEXT NOT NULL,
    topic TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    text TEXT NOT NULL,
    data {BLOB} NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS resources_teacher ON resources (teacher_id, created_at);
"""

PUBLIC = "id, title, grade, subject, type, topic, filename, mime, size, created_at, length(text) AS text_chars"


def _precise_now() -> str:
    """To the microsecond, so materials uploaded in quick succession keep their order."""
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


class ResourceStore:
    def __init__(self, path: Path | str):
        self.db = connect(path)
        self.db.create(SCHEMA)

    def add(self, teacher_id: str, meta: dict[str, str], filename: str, mime: str, data: bytes, text: str) -> dict[str, Any]:
        rid = "r" + secrets.token_hex(6)
        self.db.run(
                "INSERT INTO resources (id, teacher_id, title, grade, subject, type, topic, filename, mime, size, text,"
                " data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (rid, teacher_id, meta["title"], meta["grade"], meta["subject"], meta["type"], meta.get("topic", ""),
                 filename, mime, len(data), text, data, _precise_now()))
        return self.get(teacher_id, rid)

    def list(self, teacher_id: str) -> list[dict[str, Any]]:
        return self.db.all(f"SELECT {PUBLIC} FROM resources WHERE teacher_id = ? ORDER BY created_at DESC, id DESC",
                           (teacher_id,))

    def get(self, teacher_id: str, rid: str) -> dict[str, Any] | None:
        return self.db.one(f"SELECT {PUBLIC} FROM resources WHERE teacher_id = ? AND id = ?", (teacher_id, rid))

    def text(self, teacher_id: str, rid: str) -> str | None:
        row = self.db.one("SELECT text FROM resources WHERE teacher_id = ? AND id = ?", (teacher_id, rid))
        return row["text"] if row else None

    def file(self, teacher_id: str, rid: str) -> tuple[str, str, bytes] | None:
        row = self.db.one("SELECT filename, mime, data FROM resources WHERE teacher_id = ? AND id = ?", (teacher_id, rid))
        return (row["filename"], row["mime"], bytes(row["data"])) if row else None

    def delete(self, teacher_id: str, rid: str) -> bool:
        return self.db.run("DELETE FROM resources WHERE teacher_id = ? AND id = ?", (teacher_id, rid)) > 0
