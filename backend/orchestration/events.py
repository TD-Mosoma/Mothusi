import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Literal

from pydantic import BaseModel

EventType = Literal[
    "run_started",   # orchestrator accepted the job
    "plan",          # orchestrator decided which steps to run and why
    "decision",      # orchestrator routed work based on a result
    "agent_started",
    "agent_output",
    "tool",          # deterministic tool call (checks, retrieval, rebalancing)
    "check_passed",
    "check_failed",
    "repair",        # agent output did not match its schema and was sent back
    "llm_retry",     # transient model/API failure, retried
    "warning",
    "error",
    "run_completed",
    "run_failed",
]


class Event(BaseModel):
    run_id: str
    seq: int
    ts: str
    elapsed_ms: int
    agent: str
    type: EventType
    title: str
    detail: str = ""
    data: dict[str, Any] | None = None
    duration_ms: int | None = None
    node: str | None = None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class RunTrace:
    """Ordered, timestamped record of everything the agents do during one run."""

    def __init__(self, run_id: str, on_event: Callable[[Event], None] | None = None):
        self.run_id = run_id
        self.events: list[Event] = []
        self.done = False
        self.node: str | None = None  # LangGraph node currently running, for the live graph view
        self._t0 = time.monotonic()
        self.deadline: float | None = None  # time.monotonic() by which the run must end (serverless hosts)
        self._lock = threading.Lock()
        self._on_event = on_event

    def remaining(self) -> float:
        """Seconds left before the deadline; unlimited when the run has none."""
        return float("inf") if self.deadline is None else self.deadline - time.monotonic()

    def emit(
        self,
        agent: str,
        type: EventType,
        title: str,
        detail: str = "",
        data: dict[str, Any] | None = None,
        duration_ms: int | None = None,
    ) -> Event:
        with self._lock:
            event = Event(
                run_id=self.run_id,
                seq=len(self.events) + 1,
                ts=utc_now(),
                elapsed_ms=int((time.monotonic() - self._t0) * 1000),
                agent=agent,
                type=type,
                title=title,
                detail=detail,
                data=data,
                duration_ms=duration_ms,
                node=self.node,
            )
            self.events.append(event)
        if self._on_event:
            self._on_event(event)
        return event

    def since(self, index: int) -> list[Event]:
        with self._lock:
            return self.events[index:]

    def count(self, type: str) -> int:
        with self._lock:
            return sum(1 for e in self.events if e.type == type)

    def elapsed_ms(self) -> int:
        return int((time.monotonic() - self._t0) * 1000)
