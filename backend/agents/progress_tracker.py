from orchestration.events import RunTrace
from models.schemas import WHOLE_CLASS, FeedbackRequest, LessonRequest
from storage.database import Store

OVERALL_TO_OUTCOME = {"Worked well": "Worked", "Partly worked": "Partly worked", "Did not work": "Did not work"}


class ProgressTracker:
    """Stores teacher feedback and hands the relevant parts to future workflows. The model is never retrained."""

    name = "Progress Tracker"

    def recall(self, store: Store, trace: RunTrace, req: LessonRequest) -> list[dict]:
        ids = [l.id for l in req.learners] + [WHOLE_CLASS]
        trace.emit(self.name, "tool", "Searching feedback from earlier lessons",
                   f"{len(req.learners)} learner profiles and whole-class notes")
        rows = store.feedback_for(ids)
        rows.sort(key=lambda r: (r.get("subject") != req.subject, r.get("outcome") == "Worked"))
        if not rows:
            trace.emit(self.name, "agent_output", "No earlier feedback for these learners",
                       "Planning starts from the profiles alone.")
            return []
        worked = sum(r["outcome"] == "Worked" for r in rows)
        failed = sum(r["outcome"] == "Did not work" for r in rows)
        names = {l.id: l.name for l in req.learners}
        lines = []
        for r in rows[:6]:
            who = "Whole class" if r["learner_id"] == WHOLE_CLASS else names.get(r["learner_id"], r.get("learner_label") or r["learner_id"])
            lines.append(f"{who}: \"{r.get('strategy') or r.get('instruction')}\" — {r['outcome']}")
        trace.emit(self.name, "agent_output",
                   f"Recalled {len(rows)} feedback notes ({worked} worked, {failed} did not work)",
                   "; ".join(lines), {"memory": rows[:12]})
        return rows

    def record(self, store: Store, trace: RunTrace, fb: FeedbackRequest, plan: dict) -> dict:
        req = plan["request"]
        trace.emit(self.name, "agent_started", "Recording the teacher's lesson feedback", f"Overall: {fb.overall}")
        rows = [
            {"lesson_id": fb.lesson_id, "run_id": fb.run_id, "grade": req["grade"], "subject": req["subject"],
             "topic": req["topic"], "learner_id": o.learner_id, "learner_label": o.learner_label,
             "adaptation_id": o.adaptation_id, "strategy": o.strategy, "instruction": o.instruction,
             "outcome": o.outcome, "note": o.note}
            for o in fb.outcomes
        ]
        lesson_note = " ".join(p for p in [fb.happened.strip(), f"Next time: {fb.change.strip()}" if fb.change.strip() else ""] if p)
        rows.append({"lesson_id": fb.lesson_id, "run_id": fb.run_id, "grade": req["grade"], "subject": req["subject"],
                     "topic": req["topic"], "learner_id": WHOLE_CLASS, "learner_label": "Whole class",
                     "adaptation_id": None, "strategy": "Overall lesson plan", "instruction": "",
                     "outcome": OVERALL_TO_OUTCOME[fb.overall], "note": lesson_note})
        store.add_feedback(rows)

        avoid = [o for o in fb.outcomes if o.outcome == "Did not work"]
        keep = [o for o in fb.outcomes if o.outcome == "Worked"]
        for o in avoid:
            trace.emit(self.name, "decision", f"Will avoid \"{o.strategy}\" for {o.learner_label or o.learner_id}",
                       "Future plans that repeat it will be rejected by the Reviewer.")
        for o in keep:
            trace.emit(self.name, "decision", f"Will build on \"{o.strategy}\" for {o.learner_label or o.learner_id}",
                       "Shared with the Needs Matcher and Adaptation Designer next time.")
        trace.emit(self.name, "agent_output", f"Saved {len(rows)} feedback notes",
                   "Mothusi does not retrain its model. It brings these notes into the next planning workflow.")
        return {"saved": len(rows), "avoid": [o.strategy for o in avoid], "build_on": [o.strategy for o in keep]}
