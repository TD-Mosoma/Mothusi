import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

from agents.base import AgentOutputError
from config import Settings
from llm.client import LLMClient, LLMError, build_client
from orchestration.events import RunTrace
from storage.database import Store

log = logging.getLogger("mothusi.runs")

Job = Callable[[RunTrace, LLMClient], dict]


class RunManager:
    """Runs agent workflows in the background and keeps their live traces for streaming."""

    def __init__(self, settings: Settings, store: Store, max_parallel_runs: int = 4):
        self.settings = settings
        self.store = store
        self.traces: dict[str, RunTrace] = {}
        self._pool = ThreadPoolExecutor(max_workers=max_parallel_runs, thread_name_prefix="mothusi-run")
        store.mark_interrupted_runs()

    def start(self, *, kind: str, title: str, request: dict, job: Job, offline: bool = False,
              uses_model: bool = True, parent_run_id: str | None = None, lesson_id: str | None = None) -> str:
        llm = build_client(self.settings, offline=offline or not uses_model)
        model = llm.label if uses_model else "none"
        run_id = uuid.uuid4().hex[:12]
        self.store.create_run(run_id=run_id, kind=kind, title=title, request=request, model=model,
                              parent_run_id=parent_run_id, lesson_id=lesson_id)
        trace = RunTrace(run_id, on_event=self.store.add_event)
        self.traces[run_id] = trace
        self._pool.submit(self._execute, run_id, kind, title, trace, llm, job, uses_model)
        return run_id

    def _execute(self, run_id: str, kind: str, title: str, trace: RunTrace, llm: LLMClient, job: Job,
                 uses_model: bool) -> None:
        if uses_model:
            detail = f"Model: {llm.label}" + ("" if llm.live else ". Offline demo model: rule-based, no translation.")
            if getattr(llm, "language_model", None):
                detail += f". Translation model: {llm.language_model}"
        else:
            detail = "Deterministic step: no language model needed."
        trace.emit("Orchestrator", "run_started", title, detail,
                   {"kind": kind, "model": llm.label if uses_model else None, "live": llm.live and uses_model})
        try:
            result = job(trace, llm)
        except (AgentOutputError, LLMError) as exc:
            self._fail(run_id, trace, str(exc))
        except Exception as exc:  # noqa: BLE001 - a run must always end with a visible outcome
            log.exception("Run %s crashed", run_id)
            self._fail(run_id, trace, f"Something went wrong inside Mothusi ({type(exc).__name__}). Nothing was saved.")
        else:
            status = "completed_with_warnings" if result.get("warnings") else "completed"
            self.store.finish_run(run_id, status, result=result)
            trace.emit("Orchestrator", "run_completed",
                       "Finished" + (f" with {len(result['warnings'])} item(s) for your attention" if result.get("warnings") else ""),
                       f"Total time {trace.elapsed_ms() / 1000:.1f}s",
                       {"status": status, "stats": result.get("pack", {}).get("stats")})
        finally:
            trace.done = True

    def _fail(self, run_id: str, trace: RunTrace, message: str) -> None:
        self.store.finish_run(run_id, "failed", error=message)
        trace.emit("Orchestrator", "run_failed", "Stopped safely", message)
