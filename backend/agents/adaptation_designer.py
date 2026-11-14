import re

from orchestration.events import RunTrace
from llm.client import Completion, LLMClient
from models.schemas import Adaptation, DesignerTurn, DraftAdaptation, LessonAnalysis, LessonRequest, NeedsMatch
from tools.strategy_library import relevant_strategies
from tools.validation_tools import check_adaptations
from agents.base import Agent, compact, describe_constraints, describe_learners, describe_memory, resolve_learner

MAX_TOOL_CALLS = 2

SHAPE = """{
  "action": "check or submit",
  "note": "one sentence on what you changed or why you are submitting",
  "adaptations": [
    {"learner_id": "learner id, or whole_class", "phase": "lesson phase",
     "strategy": "short name", "instruction": "exactly what the teacher does or sets up",
     "teacher_minutes": 0, "prep_minutes": 5, "materials": ["bottle tops", "chalkboard"],
     "addresses": "which need this supports", "replaces": null}
  ]
}"""

RULES = (
    "Rules:\n"
    "- teacher_minutes is the one-to-one time the TEACHER personally spends. Independent, peer-supported or "
    "whole-class activities count as 0. The total across all adaptations must fit the one-to-one budget.\n"
    "- prep_minutes is the time the teacher needs before class to make or set up materials. The total must fit "
    "the preparation time available.\n"
    "- Respect every classroom condition (printer, devices, venue, class size).\n"
    "- Keep the same learning objective for every learner. Change the route, not the destination.\n"
    "- Use cheap materials found in South African classrooms and homes: chalkboard, paper strips, bottle tops, "
    "counters, stones, sticks, fruit.\n"
    "- For a learner whose learning language is not English, you may say Mothusi will prepare their "
    "explanation in that language. Never choose a language for a learner.\n"
    "- Reuse strategies the teacher said worked. Never repeat strategies the teacher said did not work.\n"
    "- The learner_id field must be the exact id from the profile list (or whole_class). In the strategy and "
    "instruction text, call learners by their label (for example Learner A), never by their id."
)

TOOLS = (
    "Tool available: check_plan. It runs Mothusi's constraint checks (one-to-one time budget, printer, devices, "
    "preparation time, noisy venue, every learner covered, no diagnostic labels, no repeats of strategies that did not work) on "
    f"your draft. To use it, reply with \"action\": \"check\" and your draft. You may use it up to {MAX_TOOL_CALLS} "
    "times. When you are confident, reply with \"action\": \"submit\" to hand the adaptations to the Reviewer."
)


class AdaptationDesigner(Agent):
    name = "Adaptation Designer"
    task = "adaptation_designer"
    system = (
        "You are the Adaptation Designer, a specialist in inclusive early-grade teaching. You turn identified "
        "support needs into concrete, practical classroom adaptations that a busy teacher with a large class can "
        "actually carry out."
    )

    def _base_prompt(self, req: LessonRequest, analysis: LessonAnalysis, needs: NeedsMatch, memory: list[dict]) -> str:
        return (
            f"Grade {req.grade.split()[-1]} {req.subject}: {req.topic}\n"
            f"Objective: {analysis.objective_summary}\n"
            f"Lesson flow: {compact([p.model_dump() for p in analysis.flow])}\n\n"
            f"Learner profiles:\n{describe_learners(req)}\n\n"
            f"Support needs found by the Needs Matcher: {compact([n.model_dump() for n in needs.needs])}\n"
            f"Whole-class considerations: {compact(needs.whole_class_considerations)}\n\n"
            f"Classroom conditions (MUST respect):\n{describe_constraints(req)}\n\n"
            f"What earlier lessons taught us (teacher feedback):\n{describe_memory(memory)}\n\n{RULES}"
        )

    def design(self, llm: LLMClient, trace: RunTrace, req: LessonRequest, analysis: LessonAnalysis,
               needs: NeedsMatch, memory: list[dict], teacher_note: str = "", guidance: str = "") -> list[DraftAdaptation]:
        trace.emit(self.name, "agent_started", "Designing practical adaptations",
                   f"{len(needs.needs)} needs to address within a {req.constraints.support_minutes}-minute one-to-one budget")
        library = relevant_strategies(req)
        trace.emit(self.name, "tool", f"Looked up the vetted strategy library: {len(library)} strategies fit",
                   "Only strategies that suit these learners and today's conditions (printer, devices, venue, "
                   "preparation time) are offered.", {"tool": "strategy_library", "strategies": [s.title for s in library]})
        prompt = (
            f"{self._base_prompt(req, analysis, needs, memory)}{_extra(teacher_note, guidance)}\n\n"
            "Vetted strategies that fit this class (adapt them to the lesson; you may also design your own):\n"
            + "\n".join(f"- {s.as_prompt()}" for s in library) + "\n\n"
            "Design 1–2 adaptations for each learner with a profile, plus 0–2 whole-class adaptations.\n\n"
            f"{TOOLS}\n\nShape:\n{SHAPE}"
        )
        drafts, completion, ms = self._tool_loop(
            llm, trace, prompt, req, memory, keep=[],
            context={"mode": "design", "request": req.model_dump(), "analysis": analysis.model_dump(),
                     "needs": needs.model_dump(), "memory": memory},
        )
        total = sum(a.teacher_minutes for a in drafts)
        self.output(
            trace, f"Proposed {len(drafts)} adaptations ({total} min of one-to-one time)",
            "; ".join(f"{a.strategy} ({a.teacher_minutes} min)" for a in drafts),
            {"adaptations": [a.model_dump(exclude_none=True) for a in drafts]}, completion, ms,
        )
        return drafts

    def revise(self, llm: LLMClient, trace: RunTrace, req: LessonRequest, analysis: LessonAnalysis,
               needs: NeedsMatch, memory: list[dict], keep: list[Adaptation],
               rejected: list[tuple[Adaptation | None, str, list[str]]], attempt: int,
               teacher_note: str = "", guidance: str = "") -> list[DraftAdaptation]:
        """rejected: (adaptation or None for a missing learner, learner_id, reasons)."""
        trace.emit(self.name, "agent_started", f"Revising {len(rejected)} rejected item(s) (attempt {attempt})",
                   "Approved adaptations are kept as they are.")
        kept_minutes = sum(a.teacher_minutes for a in keep)
        lines = []
        for adaptation, learner_id, reasons in rejected:
            if adaptation is None:
                lines.append(f'- MISSING: learner "{learner_id}" needs an adaptation. Problems: {" | ".join(reasons)}')
            else:
                lines.append(f'- id "{adaptation.id}" for "{learner_id}": {compact(adaptation.model_dump(exclude={"revision"}))}\n'
                             f'  Problems: {" | ".join(reasons)}')
        prompt = (
            f"{self._base_prompt(req, analysis, needs, memory)}{_extra(teacher_note, guidance)}\n\n"
            f"Approved adaptations that stay (they already use {kept_minutes} min of one-to-one time):\n"
            f"{compact([a.model_dump(exclude={'revision'}) for a in keep]) if keep else 'none'}\n\n"
            f"The Reviewer REJECTED these. Write one replacement for each, fixing every problem. Set \"replaces\" to "
            f"the rejected id (or null for a missing learner). The one-to-one time of your replacements must fit in "
            f"the {max(0, req.constraints.support_minutes - kept_minutes)} min still available.\n" + "\n".join(lines) +
            f"\n\n{TOOLS}\n\nShape:\n{SHAPE}"
        )
        drafts, completion, ms = self._tool_loop(
            llm, trace, prompt, req, memory, keep=keep,
            context={"mode": "revise", "request": req.model_dump(), "attempt": attempt,
                     "rejected": [{"id": a.id if a else None, "learner_id": lid, "reasons": r} for a, lid, r in rejected],
                     "keep_minutes": kept_minutes},
        )
        self.output(
            trace, f"Revised {len(drafts)} adaptation(s)",
            "; ".join(f"{a.strategy} ({a.teacher_minutes} min)" for a in drafts),
            {"adaptations": [a.model_dump(exclude_none=True) for a in drafts]}, completion, ms,
        )
        return drafts

    def _tool_loop(self, llm: LLMClient, trace: RunTrace, prompt: str, req: LessonRequest, memory: list[dict],
                   *, keep: list[Adaptation], context: dict) -> tuple[list[DraftAdaptation], Completion, int]:
        """Let the Designer test drafts with check_plan before it submits to the Reviewer."""
        messages: list[dict[str, str]] = []
        total_ms = 0
        for turn in range(MAX_TOOL_CALLS + 1):
            result, completion, ms = self.call(llm, trace, prompt, DesignerTurn, messages=messages,
                                               context={**context, "turn": turn})
            total_ms += ms
            drafts = [_with_names(DraftAdaptation.model_validate(a.model_dump()), req) for a in result.adaptations]
            if result.action == "submit":
                return drafts, completion, total_ms
            if turn == MAX_TOOL_CALLS:
                trace.emit(self.name, "decision", "Tool budget used; submitting the latest draft",
                           f"check_plan can be used {MAX_TOOL_CALLS} times per design step.")
                return drafts, completion, total_ms
            problems = check_plan(drafts, keep, req, memory)
            trace.emit(self.name, "tool", f"Used check_plan on a draft of {len(drafts)} adaptation(s)",
                       "No problems found" if not problems else f"{len(problems)} problem(s): " + " | ".join(problems[:3]),
                       {"tool": "check_plan", "problems": problems, "note": result.note})
            prompt = ("check_plan result: " + ("no problems found. Submit when you are ready."
                      if not problems else "\n- " + "\n- ".join(problems) + "\nFix these, then check again or submit.")
                      + f"\n\nShape:\n{SHAPE}")
        raise AssertionError("unreachable")


def check_plan(drafts: list[DraftAdaptation], keep: list[Adaptation], req: LessonRequest,
               memory: list[dict]) -> list[str]:
    """The Designer's tool: the Reviewer's deterministic checks, run on a draft before submission."""
    trial = list(keep) + [Adaptation(**d.model_dump(exclude={"replaces"}), id=f"draft{i + 1}") for i, d in enumerate(drafts)]
    issues, _ = check_adaptations(trial, req, memory)
    kept_ids = {a.id for a in keep}
    return [i.message for i in issues if i.adaptation_id not in kept_ids]


def _with_names(draft: DraftAdaptation, req: LessonRequest) -> DraftAdaptation:
    """Model output boundary: learner_id must be an id, while the text the teacher reads uses the learner's label."""
    names = {l.id: l.name for l in req.learners}
    if not names:
        return draft
    learner_id = resolve_learner(draft.learner_id, req.learners) or draft.learner_id
    pattern = re.compile(r"\b(" + "|".join(re.escape(i) for i in names) + r")\b")
    swap = lambda text: pattern.sub(lambda m: names[m.group(1)], text)
    return draft.model_copy(update={"learner_id": learner_id, "strategy": swap(draft.strategy),
                                    "instruction": swap(draft.instruction), "addresses": swap(draft.addresses)})


def _extra(teacher_note: str, guidance: str) -> str:
    out = ""
    if guidance:
        out += f"\n\nGuidance from the Orchestrator: {guidance}"
    if teacher_note:
        out += f"\n\nThe teacher asked for this change: {teacher_note}"
    return out
