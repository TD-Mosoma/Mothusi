import asyncio
import re
import secrets
import sqlite3
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from config import Settings, load_settings
from llm.client import build_client
from models.curriculum import GRADES, LANGUAGES, SUBJECTS_BY_GRADE
from models.schemas import (
    WHOLE_CLASS, ExplainRequest, FeedbackRequest, LessonRequest, RecheckRequest, ReplanRequest,
)
from orchestration.events import Event
from orchestration.runs import RunManager
from orchestration.workflow import Orchestrator
from storage.auth import AuthStore
from storage.database import Store

PLAN_KINDS = {"plan", "replan"}


def _sse(event: Event) -> str:
    return f"id: {event.seq}\ndata: {event.model_dump_json()}\n\n"


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    profile: dict[str, Any]

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", normalized):
            raise ValueError("Enter a valid email address.")
        return normalized

    @field_validator("profile")
    @classmethod
    def valid_profile(cls, value: dict[str, Any]) -> dict[str, Any]:
        name = value.get("fullName")
        if not isinstance(name, str) or len(name.strip()) < 2:
            raise ValueError("Enter your full name.")
        if "password" in value or "confirmPassword" in value:
            raise ValueError("Password fields must not be included in the profile.")
        return value


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    store = Store(settings.db_path)
    auth_store = AuthStore(settings.db_path)
    runs = RunManager(settings, store)
    orchestrator = Orchestrator(settings, store)

    app = FastAPI(title="Mothusi API", version="1.0.0",
                  description="Multi-agent classroom colleague for Grades 1–4 teachers.")
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])
    app.state.store = store
    app.state.auth_store = auth_store
    app.state.runs = runs

    def current_account(authorization: str | None = Header(default=None)) -> dict[str, Any]:
        scheme, _, token = (authorization or "").partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(401, "Please log in to continue.")
        account = auth_store.account_for_session(token)
        if account is None:
            raise HTTPException(401, "Your session has expired. Please log in again.")
        return account

    def teacher_account(account: dict[str, Any] = Depends(current_account)) -> dict[str, Any]:
        if account["role"] != "teacher":
            raise HTTPException(403, "A teacher account is required for this page.")
        return account

    def learner_account(account: dict[str, Any] = Depends(current_account)) -> dict[str, Any]:
        if account["role"] != "learner":
            raise HTTPException(403, "A learner account is required for this page.")
        return account

    def plan_run(run_id: str) -> dict:
        run = store.get_run(run_id)
        if run is None:
            raise HTTPException(404, "Lesson plan not found.")
        if run["kind"] not in PLAN_KINDS or not run["result"]:
            raise HTTPException(409, "That run has no finished lesson plan.")
        return run

    # ------------------------------------------------------------ meta

    @app.post("/api/auth/register/learner", status_code=201)
    def register_learner(req: RegisterRequest):
        profile = {**req.profile, "email": req.email}
        account = auth_store.create_account(req.email, req.password, "learner", profile)
        if account is None:
            raise HTTPException(409, "An account with this email already exists. Please log in.")
        return {"access_token": auth_store.create_session(account["id"]), "user": account}

    @app.post("/api/auth/register/teacher", status_code=201)
    def register_teacher(req: RegisterRequest):
        profile = {**req.profile, "email": req.email}
        account = auth_store.create_account(req.email, req.password, "teacher", profile)
        if account is None:
            raise HTTPException(409, "An account with this email already exists. Please log in.")
        return {"access_token": auth_store.create_session(account["id"]), "user": account}

    @app.post("/api/auth/login")
    def login(req: LoginRequest):
        account = auth_store.authenticate(req.email, req.password)
        if account is None:
            raise HTTPException(401, "Email or password is incorrect.")
        return {"access_token": auth_store.create_session(account["id"]), "user": account}

    @app.get("/api/auth/me")
    def who_am_i(account: dict[str, Any] = Depends(current_account)):
        return {"user": account}

    @app.post("/api/auth/logout")
    def logout(authorization: str | None = Header(default=None), _account: dict[str, Any] = Depends(current_account)):
        _, _, token = (authorization or "").partition(" ")
        auth_store.revoke_session(token)
        return {"ok": True}

    @app.patch("/api/auth/profile")
    def update_profile(profile: dict[str, Any], account: dict[str, Any] = Depends(current_account)):
        merged = {**account["profile"], **profile}
        if "password" in merged or "confirmPassword" in merged:
            raise HTTPException(422, "Password fields cannot be saved in the profile.")
        email = str(profile.get("email", account["email"])).strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            raise HTTPException(422, "Enter a valid email address.")
        merged["email"] = email
        try:
            updated = auth_store.update_profile(account["id"], merged, email)
        except sqlite3.IntegrityError as exc:
            raise HTTPException(409, "An account with this email already exists.") from exc
        if updated is None:
            raise HTTPException(404, "Account not found.")
        return {"user": updated}

    @app.get("/api/health")
    def health():
        llm = build_client(settings)
        return {"status": "ok", "model": llm.label, "live": llm.live, "can_translate": llm.can_translate}

    @app.get("/api/graph")
    def graph():
        return orchestrator.graph_structure()

    @app.get("/api/curriculum")
    def curriculum():
        return {"grades": GRADES, "subjects_by_grade": SUBJECTS_BY_GRADE, "languages": LANGUAGES}

    # ------------------------------------------------------------ runs

    @app.post("/api/runs", status_code=202)
    def start_plan(req: LessonRequest, _account: dict[str, Any] = Depends(teacher_account)):
        title = f"{req.grade} {req.subject}: {req.topic}"
        run_id = runs.start(kind="plan", title=title, request=req.model_dump(), offline=req.offline,
                            lesson_id=req.lesson_id, job=lambda trace, llm: orchestrator.plan_lesson(trace, llm, req))
        return {"run_id": run_id}

    @app.post("/api/runs/{run_id}/replan", status_code=202)
    def start_replan(run_id: str, change: ReplanRequest, _account: dict[str, Any] = Depends(teacher_account)):
        parent = plan_run(run_id)
        request = dict(parent["request"])
        if change.constraints:
            request["constraints"] = change.constraints.model_dump()
        new_id = runs.start(kind="replan", title=f"Re-plan: {parent['title'].split(': ', 1)[-1]}", request=request,
                            offline=bool(request.get("offline")), parent_run_id=run_id,
                            lesson_id=change.lesson_id or parent["lesson_id"],
                            job=lambda trace, llm: orchestrator.replan(trace, llm, parent, change))
        return {"run_id": new_id}

    @app.post("/api/runs/{run_id}/recheck", status_code=202)
    def start_recheck(run_id: str, edit: RecheckRequest, _account: dict[str, Any] = Depends(teacher_account)):
        parent = plan_run(run_id)
        new_id = runs.start(kind="recheck", title=f"Re-check: {parent['title'].split(': ', 1)[-1]}",
                            request={**parent["request"], "adaptations": [a.model_dump() for a in edit.adaptations]},
                            offline=bool(parent["request"].get("offline")), parent_run_id=run_id,
                            lesson_id=parent["lesson_id"],
                            job=lambda trace, llm: orchestrator.recheck(trace, llm, parent, edit))
        return {"run_id": new_id}

    @app.post("/api/runs/{run_id}/approve")
    def approve(run_id: str, _account: dict[str, Any] = Depends(teacher_account)):
        plan_run(run_id)
        store.approve_run(run_id)
        return {"approved": True}

    @app.get("/api/runs")
    def list_runs(limit: int = Query(50, ge=1, le=200), _account: dict[str, Any] = Depends(teacher_account)):
        return {"runs": store.list_runs(limit)}

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str, events: bool = False, _account: dict[str, Any] = Depends(teacher_account)):
        run = store.get_run(run_id)
        if run is None:
            raise HTTPException(404, "Run not found.")
        if events:
            run["events"] = [e.model_dump() for e in store.events(run_id)]
        return run

    @app.get("/api/runs/{run_id}/events")
    async def stream_events(run_id: str, request: Request, _account: dict[str, Any] = Depends(teacher_account)):
        trace = runs.traces.get(run_id)
        if trace is None and store.get_run(run_id) is None:
            raise HTTPException(404, "Run not found.")
        try:
            start = int(request.headers.get("last-event-id", "0"))
        except ValueError:
            start = 0

        async def generate():
            if trace is None:
                for event in store.events(run_id)[start:]:
                    yield _sse(event)
                yield "event: end\ndata: {}\n\n"
                return
            index, idle = start, 0.0
            while True:
                if await request.is_disconnected():
                    return
                fresh = trace.since(index)
                for event in fresh:
                    yield _sse(event)
                index += len(fresh)
                if trace.done and not trace.since(index):
                    yield "event: end\ndata: {}\n\n"
                    return
                idle = 0.0 if fresh else idle + 0.15
                if idle >= 15:
                    yield ": keep-alive\n\n"
                    idle = 0.0
                await asyncio.sleep(0.15)

        return StreamingResponse(generate(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    # ------------------------------------------------------------ feedback memory

    @app.post("/api/feedback", status_code=202)
    def feedback(fb: FeedbackRequest, _account: dict[str, Any] = Depends(teacher_account)):
        parent = plan_run(fb.run_id)
        run_id = runs.start(kind="feedback", title=f"Feedback: {parent['title'].split(': ', 1)[-1]}",
                            request=fb.model_dump(), uses_model=False, parent_run_id=fb.run_id,
                            lesson_id=fb.lesson_id or parent["lesson_id"],
                            job=lambda trace, llm: orchestrator.record_feedback(trace, fb, parent))
        return {"run_id": run_id}

    @app.get("/api/memory")
    def memory(learner_id: list[str] = Query(default=[]), _account: dict[str, Any] = Depends(teacher_account)):
        return {"feedback": store.feedback_for([*learner_id, WHOLE_CLASS])}

    # ------------------------------------------------------------ learner portal

    @app.get("/api/learner/lessons")
    def learner_lessons(_account: dict[str, Any] = Depends(learner_account)):
        lessons, seen = [], set()
        for run in store.approved_plans():
            pack = run["result"]["pack"]
            key = run["lesson_id"] or run["id"]
            if key in seen:
                continue  # only the newest approved version of each lesson
            seen.add(key)
            lessons.append({"run_id": run["id"], "title": pack["title"], "grade": pack["grade"],
                            "subject": pack["subject"], "topic": pack["topic"], "approved_at": run["approved_at"]})
        return {"lessons": lessons}

    @app.get("/api/learner/lesson")
    def learner_lesson(language: str = "en", run_id: str | None = None,
                       _account: dict[str, Any] = Depends(learner_account)):
        run = store.get_run(run_id) if run_id else store.latest_approved_plan()
        if run is None or not run.get("approved_at") or run["kind"] not in PLAN_KINDS:
            return {"lesson": None}
        pack = run["result"]["pack"]
        code = _account["profile"].get("code")
        learner = next((l for l in pack["learners"] if code and l.get("code") == code), None)
        material = (learner or {}).get("material") or pack["whole_class"]["material"]
        shown_language, note = "en", None
        translation = (learner or {}).get("translation")
        if language != "en":
            if translation and translation["language"] == language and translation["status"] == "checked":
                material, shown_language = translation["material"], language
                note = "translated_ai_draft"
            else:
                note = "language_unavailable"
        return {"lesson": {
            "run_id": run["id"], "title": pack["title"], "grade": pack["grade"], "subject": pack["subject"],
            "topic": pack["topic"], "objective": pack["objective"], "success_criteria": pack["success_criteria"],
            "personalised": bool(learner and learner.get("material")), "material": material,
            "language": shown_language, "note": note,
        }}

    @app.post("/api/learner/explain", status_code=202)
    def learner_explain(ask: ExplainRequest, _account: dict[str, Any] = Depends(learner_account)):
        parent = plan_run(ask.run_id)
        if not parent.get("approved_at"):
            raise HTTPException(404, "Lesson plan not found.")
        ask = ask.model_copy(update={"learner_code": _account["profile"].get("code")})
        run_id = runs.start(kind="explain", title=f"Learner explanation: {parent['title'].split(': ', 1)[-1]}",
                            request=ask.model_dump(), offline=bool(parent["request"].get("offline")),
                            parent_run_id=ask.run_id, lesson_id=parent["lesson_id"],
                            job=lambda trace, llm: orchestrator.explain(trace, llm, parent, ask))
        return {"run_id": run_id}

    return app
