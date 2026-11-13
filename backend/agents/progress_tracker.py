from typing import TYPE_CHECKING

from orchestration.events import RunTrace
from models.schemas import WHOLE_CLASS, FeedbackRequest, LessonRequest
from storage.database import Store

if TYPE_CHECKING:
    from storage.activity import ActivityStore

OVERALL_TO_OUTCOME = {"Worked well": "Worked", "Partly worked": "Partly worked", "Did not work": "Did not work"}


class ProgressTracker:
    """Stores teacher feedback and hands the relevant parts to future workflows. The model is never retrained."""

    name = "Progress Tracker"

    def recall(self, store: Store, trace: RunTrace, req: LessonRequest, teacher_id: str | None,
               activity: "ActivityStore | None" = None) -> list[dict]:
        """Teacher feedback plus evidence from learners' own practice, as one memory the planning agents read."""
        ids = [l.id for l in req.learners] + [WHOLE_CLASS]
        trace.emit(self.name, "tool", "Searching feedback and learner practice from earlier lessons",
                   f"{len(req.learners)} learner profiles and whole-class notes")
        rows = store.feedback_for(ids, teacher_id)
        rows.sort(key=lambda r: (r.get("subject") != req.subject, r.get("outcome") == "Worked"))
        names = {l.id: l.name for l in req.learners}
        evidence = [evidence_note(e, names) for e in (activity.evidence_for(teacher_id, [l.id for l in req.learners])
                                                      if activity else [])]
        evidence = [e for e in evidence if e]
        if not rows and not evidence:
            trace.emit(self.name, "agent_output", "No earlier feedback for these learners",
                       "Planning starts from the profiles alone.")
            return []
        worked = sum(r["outcome"] == "Worked" for r in rows)
        failed = sum(r["outcome"] == "Did not work" for r in rows)
        lines = []
        for r in rows[:6]:
            who = "Whole class" if r["learner_id"] == WHOLE_CLASS else names.get(r["learner_id"], r.get("learner_label") or r["learner_id"])
            lines.append(f"{who}: \"{r.get('strategy') or r.get('instruction')}\" — {r['outcome']}")
        lines += [f"{e['learner_label']}: {e['note']}" for e in evidence[:4]]
        parts = []
        if rows:
            parts.append(f"{len(rows)} feedback notes ({worked} worked, {failed} did not work)")
        if evidence:
            parts.append(f"practice evidence for {len(evidence)} learner(s)")
        memory = rows + evidence
        trace.emit(self.name, "agent_output", "Recalled " + " and ".join(parts), "; ".join(lines),
                   {"memory": memory[:16]})
        return memory

    def record(self, store: Store, trace: RunTrace, fb: FeedbackRequest, plan: dict) -> dict:
        req = plan["request"]
        trace.emit(self.name, "agent_started", "Recording the teacher's lesson feedback", f"Overall: {fb.overall}")
        rows = [
            {"lesson_id": fb.lesson_id, "run_id": fb.run_id, "grade": req["grade"], "subject": req["subject"],
             "topic": req["topic"], "learner_id": o.learner_id, "learner_label": o.learner_label,
             "adaptation_id": o.adaptation_id, "strategy": o.strategy, "instruction": o.instruction,
             "outcome": o.outcome, "note": o.note, "teacher_id": plan.get("owner_id")}
            for o in fb.outcomes
        ]
        lesson_note = " ".join(p for p in [fb.happened.strip(), f"Next time: {fb.change.strip()}" if fb.change.strip() else ""] if p)
        rows.append({"lesson_id": fb.lesson_id, "run_id": fb.run_id, "grade": req["grade"], "subject": req["subject"],
                     "topic": req["topic"], "learner_id": WHOLE_CLASS, "learner_label": "Whole class",
                     "adaptation_id": None, "strategy": "Overall lesson plan", "instruction": "",
                     "outcome": OVERALL_TO_OUTCOME[fb.overall], "note": lesson_note,
                     "teacher_id": plan.get("owner_id")})
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


def evidence_note(e: dict, names: dict[str, str]) -> dict | None:
    """Turns a learner's practice record into a plain memory note the agents can use."""
    bits = []
    if e["answered"]:
        bits.append(f"answered {e['first_try_correct']} of {e['answered']} practice questions right first time")
    for style, n in sorted(e["explain_styles"].items(), key=lambda kv: -kv[1]):
        if style:
            bits.append(f"asked for a {style} explanation {n} time{'s' if n > 1 else ''}")
    helped = [h for h, _ in sorted(e["helped"].items(), key=lambda kv: -kv[1]) if h]
    if helped:
        bits.append(f"said {', '.join(helped[:2]).lower()} helped")
    if e["feelings"].get("Difficult"):
        bits.append("found a lesson difficult")
    if not bits:
        return None
    return {"learner_id": e["learner_id"], "learner_label": names.get(e["learner_id"], e["learner_id"]),
            "strategy": "Practice in the learner portal", "instruction": "", "outcome": "Evidence",
            "note": "; ".join(bits).capitalize() + ".", "topic": ", ".join(e["topics"]) or "earlier lessons"}
