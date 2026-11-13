import json
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from orchestration.events import RunTrace
from llm.client import Completion, LLMClient, extract_json
from models.schemas import WHOLE_CLASS, LessonRequest, language_name

T = TypeVar("T", bound=BaseModel)

SCOPE = (
    "Mothusi is a team of AI agents that works alongside South African teachers of Grades 1–4 (CAPS), "
    "learners aged about 6–10. Teachers make every final decision. Never diagnose learners, never use "
    "medical or deficit labels, and never infer needs from a learner's name, language or background: "
    "use only what the teacher wrote."
)


class AgentOutputError(Exception):
    pass


def _describe(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        parts = []
        for err in exc.errors()[:5]:
            loc = ".".join(str(p) for p in err["loc"]) or "reply"
            parts.append(f"{loc}: {err['msg']}")
        return "; ".join(parts)
    return str(exc)


class Agent:
    name: str = "Agent"
    task: str = "agent"
    system: str = ""

    def call(
        self,
        llm: LLMClient,
        trace: RunTrace,
        prompt: str,
        schema: type[T],
        *,
        context: dict[str, Any],
        max_repairs: int = 2,
        messages: list[dict[str, str]] | None = None,
    ) -> tuple[T, Completion, int]:
        """One structured exchange. Pass `messages` to continue a conversation (it is extended in place)."""
        if messages is None:
            messages = []
        if not messages:
            messages.append({"role": "system", "content": f"{self.system}\n\n{SCOPE}\nReply with one JSON object only."})
        messages.append({"role": "user", "content": prompt})
        total_ms = 0

        def on_retry(n: int, why: str) -> None:
            trace.emit(self.name, "llm_retry", f"Model call failed, retrying ({n})", why)

        for attempt in range(max_repairs + 1):
            completion = llm.complete(messages, task=self.task, context={**context, "repair": attempt}, on_retry=on_retry)
            total_ms += completion.duration_ms
            try:
                parsed = schema.model_validate(extract_json(completion.text))
                messages.append({"role": "assistant", "content": completion.text[:4000]})
                return parsed, completion, total_ms
            except (ValueError, ValidationError) as exc:
                problem = _describe(exc)
                if completion.truncated:
                    problem = "The reply was cut off before the JSON was complete. Keep every field short."
                elif not completion.text:
                    problem = "The reply was empty. Give the JSON answer itself, not only your reasoning."
                if attempt == max_repairs:
                    raise AgentOutputError(f"{self.name} could not produce usable output: {problem}") from exc
                trace.emit(self.name, "repair", "Output did not match the required format; sent back to fix", problem)
                messages += [
                    {"role": "assistant", "content": completion.text[:4000]},
                    {"role": "user", "content": f"That reply could not be used: {problem}\n"
                                                "Reply again with ONLY the corrected JSON object in the requested shape."},
                ]
        raise AssertionError("unreachable")

    def output(self, trace: RunTrace, title: str, detail: str, data: dict | None,
               completion: Completion | None, duration_ms: int) -> None:
        payload = dict(data or {})
        if completion is not None:
            if completion.reasoning:
                payload["reasoning"] = completion.reasoning[:1500]
            if completion.tokens:
                payload["tokens"] = completion.tokens
            if completion.model:
                payload["model"] = completion.model
        trace.emit(self.name, "agent_output", title, detail, payload or None, duration_ms)


# ---------------------------------------------------------------- prompt helpers

def describe_lesson(req: LessonRequest) -> str:
    lines = [
        f"Grade: {req.grade}", f"Subject: {req.subject}", f"Topic: {req.topic}",
        f"Learning objectives: {req.objectives}",
    ]
    if req.content.strip():
        lines.append(f"Lesson content from the teacher:\n{req.content.strip()}")
    return "\n".join(lines)


def describe_constraints(req: LessonRequest) -> str:
    c = req.constraints
    lines = [
        f"- {c.class_size} learners, {c.lesson_minutes}-minute lesson",
        f"- The teacher has only {c.support_minutes} minutes of one-to-one time IN TOTAL for the whole lesson",
        f"- The teacher has {c.prep_minutes} minutes IN TOTAL to prepare before the lesson",
        f"- Printer: {'available' if c.has_printer else 'NOT available (nothing can be printed)'}",
        f"- Learner devices: {'available' if c.has_devices else 'NOT available'}",
        f"- Venue: {'NOISY (spoken instructions and listening will not work well)' if c.noisy_venue else 'normal classroom'}",
    ]
    if c.notes.strip():
        lines.append(f"- Teacher's note: {c.notes.strip()}")
    return "\n".join(lines)


def describe_learners(req: LessonRequest) -> str:
    if not req.learners:
        return "No individual learner profiles were provided; plan for the whole class."
    rows = []
    for l in req.learners:
        rows.append(
            f'- id "{l.id}" ({l.name}): strengths: {l.strengths or "not recorded"}; '
            f"support that helps: {l.support or 'not recorded'}; learning language: {language_name(l.language)}"
        )
    return "\n".join(rows)


def describe_memory(memory: list[dict]) -> str:
    if not memory:
        return "No earlier feedback from this teacher about these learners."
    rows = []
    for m in memory[:12]:
        who = "whole class" if m["learner_id"] == WHOLE_CLASS else (m.get("learner_label") or m["learner_id"])
        if m.get("outcome") == "Evidence":
            rows.append(f"- {who}: from their own practice ({m.get('topic') or 'earlier lessons'}): {m.get('note')}")
            continue
        what = m.get("strategy") or m.get("instruction") or "a strategy"
        note = f" Teacher's note: {m['note']}" if m.get("note") else ""
        rows.append(f"- {who}: \"{what}\" — {m['outcome']} ({m.get('topic') or 'earlier lesson'}).{note}")
    return "\n".join(rows)


def compact(obj: Any) -> str:
    if isinstance(obj, BaseModel):
        return obj.model_dump_json(exclude_none=True)
    return json.dumps(obj, ensure_ascii=False, default=lambda o: o.model_dump() if isinstance(o, BaseModel) else str(o))
