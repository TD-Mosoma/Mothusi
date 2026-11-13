from dataclasses import dataclass, field

from orchestration.events import RunTrace
from llm.client import LLMClient
from models.curriculum import AGE_RANGE
from models.schemas import Adaptation, LearnerMaterial, LessonAnalysis, LessonRequest, QualityReview
from tools.validation_tools import CheckResult, Issue, check_adaptations, check_material
from agents.base import Agent, compact, describe_learners

SHAPE = """{
  "verdicts": [{"adaptation_id": "a1", "approved": true, "reason": "short reason"}],
  "objective_preserved": true,
  "summary": "one sentence"
}"""


@dataclass
class ReviewOutcome:
    issues: list[Issue] = field(default_factory=list)
    checks: list[CheckResult] = field(default_factory=list)
    summary: str = ""

    @property
    def passed(self) -> bool:
        return not self.issues

    def issues_for(self, adaptation_id: str) -> list[str]:
        return [i.message for i in self.issues if i.adaptation_id == adaptation_id]


class Reviewer(Agent):
    name = "Reviewer"
    task = "reviewer"
    system = (
        "You are the Reviewer, a careful quality reviewer for early-grade teaching plans. For each adaptation you "
        "judge: does it keep the learning objective (not water it down), is it clearly linked to the learner's "
        "stated support, is it right for the age group, is it practical in a large class, and is the language "
        "respectful and strengths-based? Approve unless there is a real problem; when you reject, give a concrete "
        "reason the designer can act on. Time, printing, devices and noise are already checked by code."
    )

    def review_adaptations(self, llm: LLMClient, trace: RunTrace, req: LessonRequest, analysis: LessonAnalysis,
                           adaptations: list[Adaptation], memory: list[dict], *, round_label: str,
                           teacher_note: str = "") -> ReviewOutcome:
        trace.emit(self.name, "agent_started", f"Reviewing {len(adaptations)} adaptations ({round_label})")
        issues, checks = check_adaptations(adaptations, req, memory)
        trace.emit(self.name, "tool", "Ran constraint checks",
                   f"{sum(c.passed for c in checks)} of {len(checks)} passed",
                   {"checks": [c.to_dict() for c in checks]})
        for issue in issues:
            trace.emit(self.name, "check_failed", _check_title(issue.check), issue.message,
                       {"adaptation_id": issue.adaptation_id, "learner_id": issue.learner_id, "check": issue.check})

        flagged = {i.adaptation_id for i in issues}
        to_judge = [a for a in adaptations if a.id not in flagged]
        summary = ""
        if to_judge:
            prompt = (
                f"{req.grade} (ages {AGE_RANGE[req.grade]}) {req.subject}: {req.topic}\n"
                f"Objective: {analysis.objective_summary}\n"
                f"Success criteria: {compact(analysis.success_criteria)}\n"
                f"Class size: {req.constraints.class_size}\n\n"
                f"Learner profiles:\n{describe_learners(req)}\n\n"
                + (f"The teacher asked for this change, so reject anything that ignores it: {teacher_note}\n\n" if teacher_note else "")
                + f"Adaptations to review:\n{compact([a.model_dump(exclude={'revision', 'replaces'}) for a in to_judge])}\n\n"
                f"Give exactly one verdict per adaptation id.\n\nShape:\n{SHAPE}"
            )
            review, completion, ms = self.call(
                llm, trace, prompt, QualityReview,
                context={"request": req.model_dump(), "adaptations": [a.model_dump() for a in to_judge],
                         "teacher_note": teacher_note},
            )
            verdicts = {v.adaptation_id: v for v in review.verdicts}
            rejected = []
            for a in to_judge:
                v = verdicts.get(a.id)
                if v and not v.approved:
                    issue = Issue("quality", v.reason or "The Reviewer found a quality problem.", a.id, a.learner_id)
                    issues.append(issue)
                    rejected.append(a)
                    trace.emit(self.name, "check_failed", _check_title("quality"), f"'{a.strategy}': {issue.message}",
                               {"adaptation_id": a.id, "learner_id": a.learner_id, "check": "quality"})
            if not review.objective_preserved:
                trace.emit(self.name, "warning", "Objective may be weakened", review.summary)
            checks.append(CheckResult("quality", f"Keeps the objective, linked to profiles, suits {req.grade}",
                                      not rejected and review.objective_preserved))
            summary = review.summary
            self.output(trace, f"Quality review: {len(to_judge) - len(rejected)} of {len(to_judge)} approved",
                        summary, {"verdicts": [v.model_dump() for v in review.verdicts]}, completion, ms)

        outcome = ReviewOutcome(issues, checks, summary)
        if outcome.passed:
            trace.emit(self.name, "check_passed", "All adaptations approved",
                       f"{len(checks)} checks passed", {"checks": [c.to_dict() for c in checks]})
        return outcome

    def review_material(self, trace: RunTrace, req: LessonRequest, material: LearnerMaterial, who: str) -> list[Issue]:
        issues = check_material(material, req)
        if issues:
            for issue in issues:
                trace.emit(self.name, "check_failed", f"Learner material for {who}: {_check_title(issue.check)}", issue.message,
                           {"check": issue.check, "who": who})
        else:
            trace.emit(self.name, "check_passed", f"Learner material for {who} approved",
                       f"Reading level suits {req.grade}; activity respects classroom conditions")
        return issues


_TITLES = {
    "teacher_time": "Rejected: too much one-to-one teacher time",
    "printer": "Rejected: needs a printer",
    "devices": "Rejected: needs devices",
    "noise": "Rejected: will not work in a noisy venue",
    "coverage": "Rejected: learner coverage",
    "labels": "Rejected: diagnostic or deficit language",
    "memory": "Rejected: repeats a strategy that did not work",
    "quality": "Rejected by quality review",
    "readability": "Rejected: too hard to read",
}


def _check_title(check: str) -> str:
    return _TITLES.get(check, f"Rejected: {check}")
