from orchestration.events import RunTrace
from models.schemas import WHOLE_CLASS, Adaptation, LessonAnalysis, LessonRequest, NeedsMatch
from tools.document_tools import render_markdown
from tools.validation_tools import CheckResult


class PackBuilder:
    """Assembles approved work into the teacher-support pack. Deterministic: it organises, it never rewrites."""

    name = "Pack Builder"

    def build(self, trace: RunTrace, *, req: LessonRequest, analysis: LessonAnalysis, needs: NeedsMatch,
              adaptations: list[Adaptation], materials: dict[str, dict], translations: dict[str, dict],
              checks: list[CheckResult], warnings: list[str], memory: list[dict], stats: dict) -> dict:
        trace.emit(self.name, "agent_started", "Assembling the lesson-support pack")
        learners = []
        for l in req.learners:
            learners.append({
                "id": l.id, "code": l.code, "name": l.name, "language": l.language,
                "needs": [n.model_dump() for n in needs.needs if n.learner_id == l.id],
                "adaptations": [a.model_dump() for a in adaptations if a.learner_id == l.id],
                "material": materials.get(l.id),
                "translation": _public_translation(translations.get(l.id)),
            })
        pack = {
            "title": f"{req.grade} {req.subject}: {req.topic}",
            "grade": req.grade, "subject": req.subject, "topic": req.topic,
            "objective": analysis.objective_summary,
            "success_criteria": analysis.success_criteria,
            "key_vocabulary": analysis.key_vocabulary,
            "flow": [p.model_dump() for p in analysis.flow],
            "demands": [d.model_dump() for d in analysis.demands],
            "constraints": req.constraints.model_dump(),
            "learners": learners,
            "whole_class": {
                "adaptations": [a.model_dump() for a in adaptations if a.learner_id == WHOLE_CLASS],
                "considerations": needs.whole_class_considerations,
                "material": materials.get(WHOLE_CLASS),
            },
            "checks": [c.to_dict() for c in checks],
            "warnings": warnings,
            "memory_applied": memory[:12],
            "stats": stats,
        }
        pack["markdown"] = render_markdown(pack)
        trace.emit(self.name, "agent_output", "Lesson-support pack ready for your review",
                   f"{len(adaptations)} adaptations, {sum(1 for m in materials.values() if m)} learner materials, "
                   f"{sum(1 for t in translations.values() if t and t.get('status') == 'checked')} checked translations"
                   + (f", {len(warnings)} item(s) need your attention" if warnings else ""),
                   {"checks": pack["checks"], "warnings": warnings})
        return pack


def _public_translation(t: dict | None) -> dict | None:
    if not t:
        return None
    material = t.get("material")
    return {
        "language": t["language"],
        "status": t["status"],
        "issues": t.get("issues", []),
        "back_translation": t.get("back_translation", ""),
        "material": material.model_dump() if hasattr(material, "model_dump") else material,
    }
