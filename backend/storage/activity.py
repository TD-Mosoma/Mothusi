"""What learners do with an approved lesson: opening it, answering practice questions, reflecting and asking
for another explanation. It drives learner progress, the teacher's class insights, and the evidence the
Progress Tracker hands to future plans."""

import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from orchestration.events import utc_now
from storage.db import connect

KINDS = {"opened", "answer", "practice_done", "reflection", "explain"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS learner_activity (
    id {ID},
    created_at TEXT NOT NULL,
    learner_account_id TEXT NOT NULL,
    teacher_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    learner_profile_id TEXT,
    run_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_class ON learner_activity (teacher_id, class_id, run_id);
CREATE INDEX IF NOT EXISTS activity_learner ON learner_activity (learner_account_id);
"""


class ActivityStore:
    def __init__(self, path: Path | str):
        self.db = connect(path)
        self.db.create(SCHEMA)

    def record(self, *, account_id: str, link: dict[str, Any], run_id: str, kind: str, data: dict[str, Any]) -> None:
        with self.db.tx() as t:
            if kind == "opened" and t.one(
                    "SELECT 1 AS seen FROM learner_activity WHERE learner_account_id = ? AND run_id = ? AND kind = 'opened'",
                    (account_id, run_id)):
                return  # count each learner once per lesson
            t.execute(
                "INSERT INTO learner_activity (created_at, learner_account_id, teacher_id, class_id, learner_profile_id,"
                " run_id, kind, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (utc_now(), account_id, link["teacher_id"], link["class_id"], link.get("learner_profile_id"),
                 run_id, kind, json.dumps(data)),
            )

    def _rows(self, sql: str, args: tuple) -> list[dict[str, Any]]:
        return [{**r, "data": json.loads(r["data"])} for r in self.db.all(sql, args)]

    # ------------------------------------------------------------ learner's own progress

    def progress_for_learner(self, account_id: str) -> dict[str, Any]:
        rows = self._rows("SELECT * FROM learner_activity WHERE learner_account_id = ? ORDER BY id", (account_id,))
        done = [r for r in rows if r["kind"] == "practice_done"]
        last = done[-1] if done else None
        return {
            "lessons_opened": len({r["run_id"] for r in rows if r["kind"] == "opened"}),
            "practice_done": len(done),
            "questions_answered": sum(1 for r in rows if r["kind"] == "answer"),
            "questions_tried": sum(1 for r in rows if r["kind"] == "answer" and r["data"].get("attempt", 1) == 1),
            "first_try_correct": sum(1 for r in rows if r["kind"] == "answer" and r["data"].get("correct")
                                     and r["data"].get("attempt", 1) == 1),
            "recent": {"run_id": last["run_id"], "topic": last["data"].get("topic"), "at": last["created_at"]} if last else None,
            "explanations_asked": sum(1 for r in rows if r["kind"] == "explain"),
        }

    # ------------------------------------------------------------ teacher's class insights

    def insights(self, teacher_id: str, class_id: str, run_ids: list[str] | None = None) -> dict[str, Any]:
        rows = self._rows("SELECT * FROM learner_activity WHERE teacher_id = ? AND class_id = ? ORDER BY id",
                          (teacher_id, class_id))
        if run_ids is not None:
            rows = [r for r in rows if r["run_id"] in set(run_ids)]
        lessons: dict[str, dict[str, Any]] = defaultdict(lambda: {
            "opened": set(), "practised": set(), "questions": defaultdict(lambda: {"first_try": 0, "missed": 0}),
            "feelings": Counter(), "helped": Counter(), "explain_styles": Counter()})
        learners: dict[str, dict[str, Any]] = defaultdict(lambda: {
            "opened": 0, "practice_done": 0, "first_try": 0, "missed": 0, "explain_styles": Counter(),
            "feelings": Counter(), "helped": Counter(), "last_seen": None})
        for r in rows:
            lesson, who = lessons[r["run_id"]], r["learner_profile_id"] or f"class:{r['learner_account_id']}"
            learner = learners[who]
            learner["last_seen"] = r["created_at"]
            d = r["data"]
            if r["kind"] == "opened":
                lesson["opened"].add(r["learner_account_id"]); learner["opened"] += 1
            elif r["kind"] == "answer" and d.get("attempt", 1) == 1:
                # Personalised material has its own questions, so a question is known by its wording when given.
                q = lesson["questions"][str(d.get("prompt") or d.get("question", 0))[:200]]
                key = "first_try" if d.get("correct") else "missed"
                q[key] += 1; learner[key] += 1
            elif r["kind"] == "practice_done":
                lesson["practised"].add(r["learner_account_id"]); learner["practice_done"] += 1
            elif r["kind"] == "reflection":
                lesson["feelings"][d.get("feeling")] += 1; learner["feelings"][d.get("feeling")] += 1
                for h in d.get("helped", []):
                    lesson["helped"][h] += 1; learner["helped"][h] += 1
            elif r["kind"] == "explain":
                lesson["explain_styles"][d.get("style")] += 1; learner["explain_styles"][d.get("style")] += 1
        return {
            "lessons": {run_id: {
                "opened": len(l["opened"]), "practised": len(l["practised"]),
                "questions": dict(sorted(l["questions"].items())),
                "feelings": dict(l["feelings"]), "helped": dict(l["helped"]),
                "explain_styles": dict(l["explain_styles"]),
            } for run_id, l in lessons.items()},
            "learners": {who: {**{k: v for k, v in l.items() if not isinstance(v, Counter)},
                               "explain_styles": dict(l["explain_styles"]), "feelings": dict(l["feelings"]),
                               "helped": dict(l["helped"])} for who, l in learners.items()},
        }

    # ------------------------------------------------------------ evidence for the Progress Tracker

    def evidence_for(self, teacher_id: str | None, profile_ids: list[str]) -> list[dict[str, Any]]:
        """Short, factual summaries of how each learner did in earlier lessons."""
        if not teacher_id or not profile_ids:
            return []
        marks = ",".join("?" for _ in profile_ids)
        rows = self._rows(f"SELECT * FROM learner_activity WHERE teacher_id = ? AND learner_profile_id IN ({marks})"
                          " ORDER BY id DESC LIMIT 400", (teacher_id, *profile_ids))
        by_learner: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for r in rows:
            by_learner[r["learner_profile_id"]].append(r)
        out = []
        for profile_id, items in by_learner.items():
            answers = [r for r in items if r["kind"] == "answer" and r["data"].get("attempt", 1) == 1]
            correct = sum(1 for r in answers if r["data"].get("correct"))
            styles = Counter(r["data"].get("style") for r in items if r["kind"] == "explain")
            helped = Counter(h for r in items if r["kind"] == "reflection" for h in r["data"].get("helped", []))
            feelings = Counter(r["data"].get("feeling") for r in items if r["kind"] == "reflection")
            topics = sorted({r["data"].get("topic") for r in items if r["data"].get("topic")})
            out.append({
                "learner_id": profile_id,
                "answered": len(answers), "first_try_correct": correct,
                "explain_styles": dict(styles), "helped": dict(helped), "feelings": dict(feelings),
                "topics": topics[:4],
            })
        return out
