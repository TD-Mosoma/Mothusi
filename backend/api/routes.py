import asyncio
import base64
import binascii
import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
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
from storage.activity import KINDS as ACTIVITY_KINDS, ActivityStore
from storage.auth import AuthStore
from storage.database import Store
from storage.db import IntegrityErrors
from storage.resources import ResourceStore
from storage.workspace import KINDS as WORKSPACE_KINDS, WorkspaceStore
from tools.document_text import SUPPORTED as READABLE_TYPES, UnreadableDocument, extract_text
from tools.mailer import send_reset_email

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
        _check_profile_size(value)
        name = value.get("fullName")
        if not isinstance(name, str) or len(name.strip()) < 2:
            raise ValueError("Enter your full name.")
        if "password" in value or "confirmPassword" in value:
            raise ValueError("Password fields must not be included in the profile.")
        return value


MAX_PROFILE_BYTES = 8_000


def _check_profile_size(profile: dict[str, Any]) -> None:
    if len(json.dumps(profile, default=str)) > MAX_PROFILE_BYTES:
        raise ValueError("Profile is too large.")


class JoinCodeRequest(BaseModel):
    class_id: str = Field(min_length=1, max_length=64)
    class_name: str = Field(min_length=1, max_length=80)
    learner_profile_id: str | None = Field(default=None, max_length=64)
    learner_label: str | None = Field(default=None, max_length=60)


class CodeRequest(BaseModel):
    code: str = Field(min_length=4, max_length=20)


class PictureRequest(BaseModel):
    code: str = Field(min_length=4, max_length=20)
    learner_id: str = Field(min_length=1, max_length=64)
    pictures: list[str] = Field(min_length=3, max_length=3)


class ForgotRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class ResetRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=8, max_length=128)


class ActivityRequest(BaseModel):
    run_id: str = Field(min_length=1, max_length=64)
    kind: str
    data: dict[str, Any] = Field(default_factory=dict)

    @field_validator("kind")
    @classmethod
    def known_kind(cls, value: str) -> str:
        if value not in ACTIVITY_KINDS:
            raise ValueError("Unknown activity.")
        return value


MAX_RESOURCE_BYTES = 10 * 1024 * 1024
RESOURCE_MIME = {
    ".pdf": "application/pdf", ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
}
RESOURCE_TYPES = tuple(RESOURCE_MIME)


class ResourceRequest(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    grade: str = Field(min_length=1, max_length=40)
    subject: str = Field(min_length=1, max_length=80)
    type: str = Field(min_length=1, max_length=60)
    topic: str = Field(default="", max_length=120)
    filename: str = Field(min_length=1, max_length=200)
    content_base64: str = Field(min_length=1, max_length=MAX_RESOURCE_BYTES * 4 // 3 + 8)

    @field_validator("filename")
    @classmethod
    def allowed_file(cls, value: str) -> str:
        value = value.replace("\\", "/").rsplit("/", 1)[-1].strip()
        if not value.lower().endswith(RESOURCE_TYPES):
            raise ValueError("Mothusi accepts PDF, Word, PowerPoint, Excel, text and image files.")
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
    store = Store(settings.database)
    auth_store = AuthStore(settings.database)
    workspace = WorkspaceStore(settings.database)
    activity = ActivityStore(settings.database)
    resources = ResourceStore(settings.database)
    runs = RunManager(settings, store)
    orchestrator = Orchestrator(settings, store, activity)

    def build_job(run: dict[str, Any]):
        """Rebuild a saved run's work from what was stored, so any server instance can execute it."""
        spec = run.get("job") or {}
        parent = store.get_run(run["parent_run_id"]) if run.get("parent_run_id") else None
        kind = run["kind"]
        if kind == "plan":
            req = LessonRequest.model_validate(run["request"])
            return (lambda trace, llm: orchestrator.plan_lesson(trace, llm, req, spec.get("owner_id"))), True
        if kind == "replan":
            change = ReplanRequest.model_validate(spec["change"])
            return (lambda trace, llm: orchestrator.replan(trace, llm, parent, change)), True
        if kind == "recheck":
            edit = RecheckRequest.model_validate(spec["edit"])
            return (lambda trace, llm: orchestrator.recheck(trace, llm, parent, edit)), True
        if kind == "feedback":
            fb = FeedbackRequest.model_validate(run["request"])
            return (lambda trace, llm: orchestrator.record_feedback(trace, fb, parent)), False
        if kind == "explain":
            ask = ExplainRequest.model_validate(run["request"])
            return (lambda trace, llm: orchestrator.explain(trace, llm, parent, ask)), True
        raise ValueError(f"Unknown run kind {kind!r}")

    runs.job_builder = build_job

    def expire_stale_runs() -> None:
        """Request mode: a run whose browser never started it, or that outlived its function, ends as failed."""
        if settings.run_mode != "request":
            return
        now = datetime.now(timezone.utc)
        stamp = lambda d: d.isoformat(timespec="milliseconds").replace("+00:00", "Z")  # noqa: E731
        store.expire_stale_runs(stamp(now - timedelta(minutes=10)),
                                stamp(now - timedelta(seconds=settings.run_deadline_seconds + 120)))

    async def execute(run_id: str) -> dict:
        if settings.run_mode != "request":
            return {"status": "started"}  # thread mode: the run began when it was created
        try:
            outcome = await asyncio.wait_for(run_in_threadpool(runs.execute, run_id), settings.run_deadline_seconds)
        except asyncio.TimeoutError:
            store.fail_if_running(run_id, "Mothusi ran out of time on this server. Try again, or use practice mode.")
            outcome = "timeout"
        return {"status": outcome}

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

    def owned_run(run_id: str, account: dict[str, Any]) -> dict:
        """A teacher only ever sees their own runs; anyone else's are reported as missing."""
        expire_stale_runs()
        run = store.get_run(run_id)
        if run is None or run["owner_id"] != account["id"]:
            raise HTTPException(404, "Run not found.")
        return run

    def plan_run(run_id: str, account: dict[str, Any]) -> dict:
        run = owned_run(run_id, account)
        if run["kind"] not in PLAN_KINDS or not run["result"]:
            raise HTTPException(409, "That run has no finished lesson plan.")
        return run

    def learner_link(account: dict[str, Any]) -> dict[str, Any] | None:
        return auth_store.link_for_learner(account["id"])

    def lesson_for_learner(run_id: str, link: dict[str, Any]) -> dict | None:
        """An approved plan from the learner's own teacher, for the learner's own class."""
        run = store.get_run(run_id)
        if (run is None or run["kind"] not in PLAN_KINDS or not run.get("approved_at")
                or run["owner_id"] != link["teacher_id"] or run["class_id"] != link["class_id"]):
            return None
        return run

    # ------------------------------------------------------------ meta

    @app.post("/api/auth/register/learner", status_code=201)
    def register_learner(req: RegisterRequest):
        code = str(req.profile.get("code") or "").strip()
        if code and not auth_store.code_is_valid(code):
            raise HTTPException(400, "That code is not valid. Check it with your teacher, or skip it and add it later.")
        profile = {**{k: v for k, v in req.profile.items() if k != "code"}, "email": req.email}
        account = auth_store.create_account(req.email, req.password, "learner", profile)
        if account is None:
            raise HTTPException(409, "An account with this email already exists. Please log in.")
        link = auth_store.redeem_code(code, account["id"]) if code else None
        return {"access_token": auth_store.create_session(account["id"]), "user": account, "link": link}

    @app.post("/api/auth/check-code")
    def check_code(req: CodeRequest):
        return {"valid": auth_store.code_is_valid(req.code)}

    # ------------------------------------------------------------ picture sign-in (young learners)

    def picture_class(code: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """The class a code opens, and the learners on that class list (only the code's learner for a personal code)."""
        target = auth_store.code_target(code)
        if target is None:
            raise HTTPException(400, "That code is not valid. Check it with your teacher.")
        profiles = workspace.profiles_in_class(target["teacher_id"], target["class_id"])
        if target["learner_profile_id"]:
            profiles = [p for p in profiles if p["id"] == target["learner_profile_id"]]
        return target, sorted(profiles, key=lambda p: str(p.get("name", "")).lower())

    @app.post("/api/auth/picture/roster")
    def picture_roster(req: CodeRequest):
        target, profiles = picture_class(req.code)
        ready = auth_store.picture_profiles(target["teacher_id"])
        return {"class_name": target["class_name"],
                "learners": [{"id": p["id"], "name": p.get("name", "Learner"), "has_pictures": p["id"] in ready}
                             for p in profiles]}

    def picture_profile(target: dict[str, Any], profiles: list[dict[str, Any]], learner_id: str) -> dict[str, Any]:
        profile = next((p for p in profiles if p["id"] == learner_id), None)
        if profile is None:
            raise HTTPException(404, "That name is not on this class list.")
        return profile

    @app.post("/api/auth/picture/setup", status_code=201)
    def picture_setup(req: PictureRequest):
        if not auth_store.valid_pictures(req.pictures):
            raise HTTPException(422, "Choose three pictures.")
        target, profiles = picture_class(req.code)
        learner = picture_profile(target, profiles, req.learner_id)
        klass = workspace.get(target["teacher_id"], "classes", target["class_id"]) or {}
        account = auth_store.picture_setup(
            target["teacher_id"], target["class_id"], target["class_name"],
            {"fullName": learner.get("name", "Learner"), "grade": klass.get("grade", ""),
             "language": learner.get("language", "en"), "pictureLogin": True},
            req.pictures, learner)
        if account is None:
            raise HTTPException(409, "You already have a picture password. Choose your pictures to sign in.")
        return {"access_token": auth_store.create_session(account["id"]), "user": account}

    @app.post("/api/auth/picture/login")
    def picture_login(req: PictureRequest):
        target, profiles = picture_class(req.code)
        picture_profile(target, profiles, req.learner_id)
        account, reason = auth_store.picture_login(target["teacher_id"], req.learner_id, req.pictures)
        if reason == "locked":
            raise HTTPException(423, "Too many tries. Wait 10 minutes or ask your teacher to help.")
        if reason == "missing":
            raise HTTPException(409, "Choose your pictures for the first time.")
        if account is None:
            raise HTTPException(401, "Those pictures do not match. Try again.")
        return {"access_token": auth_store.create_session(account["id"]), "user": account}

    # ------------------------------------------------------------ password recovery

    @app.post("/api/auth/forgot")
    def forgot_password(req: ForgotRequest):
        issued = auth_store.create_reset_token(req.email.strip().lower())
        response: dict[str, Any] = {"ok": True}
        if issued:
            token, account = issued
            link = f"{settings.public_url}/reset-password?token={token}"
            sent = send_reset_email(settings, account["email"], account["profile"].get("fullName", ""), link)
            if not sent and settings.show_reset_links:
                response["dev_reset_link"] = link
        return response

    @app.post("/api/auth/reset")
    def reset_password(req: ResetRequest):
        if not auth_store.reset_password(req.token, req.password):
            raise HTTPException(400, "This reset link has expired or was already used. Ask for a new one.")
        return {"ok": True}

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
        profile = {k: v for k, v in profile.items() if k not in {"code", "role"}}  # links come from teacher codes
        merged = {**account["profile"], **profile}
        try:
            _check_profile_size(merged)
        except ValueError as exc:
            raise HTTPException(413, str(exc)) from exc
        if "password" in merged or "confirmPassword" in merged:
            raise HTTPException(422, "Password fields cannot be saved in the profile.")
        email = str(profile.get("email", account["email"])).strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            raise HTTPException(422, "Enter a valid email address.")
        merged["email"] = email
        try:
            updated = auth_store.update_profile(account["id"], merged, email)
        except IntegrityErrors as exc:
            raise HTTPException(409, "An account with this email already exists.") from exc
        if updated is None:
            raise HTTPException(404, "Account not found.")
        return {"user": updated}

    @app.get("/api/health")
    def health():
        llm = build_client(settings)
        return {"status": "ok", "model": llm.label, "live": llm.live, "can_translate": llm.can_translate,
                "run_mode": settings.run_mode, "max_upload_mb": settings.max_upload_mb}

    @app.get("/api/graph")
    def graph():
        return orchestrator.graph_structure()

    @app.get("/api/curriculum")
    def curriculum():
        return {"grades": GRADES, "subjects_by_grade": SUBJECTS_BY_GRADE, "languages": LANGUAGES}

    # ------------------------------------------------------------ runs

    @app.post("/api/runs", status_code=202)
    def start_plan(req: LessonRequest, account: dict[str, Any] = Depends(teacher_account)):
        title = f"{req.grade} {req.subject}: {req.topic}"
        run_id = runs.start(kind="plan", title=title, request=req.model_dump(), offline=req.offline,
                            lesson_id=req.lesson_id, owner_id=account["id"], class_id=req.class_id,
                            spec={"owner_id": account["id"]},
                            job=lambda trace, llm: orchestrator.plan_lesson(trace, llm, req, account["id"]))
        return {"run_id": run_id}

    @app.post("/api/runs/{run_id}/replan", status_code=202)
    def start_replan(run_id: str, change: ReplanRequest, account: dict[str, Any] = Depends(teacher_account)):
        parent = plan_run(run_id, account)
        request = dict(parent["request"])
        if change.constraints:
            request["constraints"] = change.constraints.model_dump()
        new_id = runs.start(kind="replan", title=f"Re-plan: {parent['title'].split(': ', 1)[-1]}", request=request,
                            offline=bool(request.get("offline")), parent_run_id=run_id,
                            lesson_id=change.lesson_id or parent["lesson_id"],
                            owner_id=account["id"], class_id=parent["class_id"],
                            spec={"change": change.model_dump()},
                            job=lambda trace, llm: orchestrator.replan(trace, llm, parent, change))
        return {"run_id": new_id}

    @app.post("/api/runs/{run_id}/recheck", status_code=202)
    def start_recheck(run_id: str, edit: RecheckRequest, account: dict[str, Any] = Depends(teacher_account)):
        parent = plan_run(run_id, account)
        new_id = runs.start(kind="recheck", title=f"Re-check: {parent['title'].split(': ', 1)[-1]}",
                            request={**parent["request"], "adaptations": [a.model_dump() for a in edit.adaptations]},
                            offline=bool(parent["request"].get("offline")), parent_run_id=run_id,
                            lesson_id=parent["lesson_id"], owner_id=account["id"], class_id=parent["class_id"],
                            spec={"edit": edit.model_dump()},
                            job=lambda trace, llm: orchestrator.recheck(trace, llm, parent, edit))
        return {"run_id": new_id}

    @app.post("/api/runs/{run_id}/approve")
    def approve(run_id: str, account: dict[str, Any] = Depends(teacher_account)):
        plan_run(run_id, account)
        store.approve_run(run_id)
        return {"approved": True}

    @app.get("/api/runs")
    def list_runs(limit: int = Query(50, ge=1, le=200), account: dict[str, Any] = Depends(teacher_account)):
        expire_stale_runs()
        return {"runs": store.list_runs(account["id"], limit)}

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str, events: bool = False, account: dict[str, Any] = Depends(teacher_account)):
        run = owned_run(run_id, account)
        if events:
            run["events"] = [e.model_dump() for e in store.events(run_id)]
        return run

    def event_stream(run_id: str, request: Request) -> StreamingResponse:
        try:
            start = int(request.headers.get("last-event-id", "0"))
        except ValueError:
            start = 0

        async def generate():
            index, idle = start, 0.0
            while True:
                if await request.is_disconnected():
                    return
                trace = runs.traces.get(run_id)
                if trace is not None:  # the run is executing in this process: stream from memory
                    finished = trace.done  # read first: once done, no event can follow what we collect next
                    fresh = trace.since(index)
                    wait = 0.15
                else:  # it runs elsewhere, or has finished: stream what has been saved
                    expire_stale_runs()
                    status = await run_in_threadpool(store.run_status, run_id)
                    fresh = await run_in_threadpool(store.events_since, run_id, index)
                    finished = status != "running"
                    if finished:  # the final event is always saved before the run is marked finished
                        fresh = await run_in_threadpool(store.events_since, run_id, index)
                    wait = 0.6
                for event in fresh:
                    yield _sse(event)
                if fresh:
                    index = fresh[-1].seq
                if finished:
                    yield "event: end\ndata: {}\n\n"
                    return
                idle = 0.0 if fresh else idle + wait
                if idle >= 15:
                    yield ": keep-alive\n\n"
                    idle = 0.0
                await asyncio.sleep(wait)

        return StreamingResponse(generate(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @app.post("/api/runs/{run_id}/execute")
    async def execute_run(run_id: str, account: dict[str, Any] = Depends(teacher_account)):
        owned_run(run_id, account)
        return await execute(run_id)

    @app.get("/api/runs/{run_id}/events")
    async def stream_events(run_id: str, request: Request, account: dict[str, Any] = Depends(teacher_account)):
        owned_run(run_id, account)
        return event_stream(run_id, request)

    # ------------------------------------------------------------ feedback memory

    @app.post("/api/feedback", status_code=202)
    def feedback(fb: FeedbackRequest, account: dict[str, Any] = Depends(teacher_account)):
        parent = plan_run(fb.run_id, account)
        run_id = runs.start(kind="feedback", title=f"Feedback: {parent['title'].split(': ', 1)[-1]}",
                            request=fb.model_dump(), uses_model=False, parent_run_id=fb.run_id,
                            lesson_id=fb.lesson_id or parent["lesson_id"],
                            owner_id=account["id"], class_id=parent["class_id"],
                            job=lambda trace, llm: orchestrator.record_feedback(trace, fb, parent))
        return {"run_id": run_id}

    @app.get("/api/memory")
    def memory(learner_id: list[str] = Query(default=[]), account: dict[str, Any] = Depends(teacher_account)):
        return {"feedback": store.feedback_for([*learner_id, WHOLE_CLASS], account["id"])}

    # ------------------------------------------------------------ teacher workspace (on the server)

    def workspace_kind(kind: str) -> str:
        if kind not in WORKSPACE_KINDS:
            raise HTTPException(404, "Unknown record type.")
        return kind

    @app.get("/api/teacher/workspace")
    def load_workspace(account: dict[str, Any] = Depends(teacher_account)):
        return workspace.load(account["id"])

    @app.put("/api/teacher/workspace/{kind}/{doc_id}")
    def save_workspace_doc(kind: str, doc_id: str, body: dict[str, Any],
                           account: dict[str, Any] = Depends(teacher_account)):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", doc_id):
            raise HTTPException(422, "Invalid record id.")
        try:
            return workspace.put(account["id"], workspace_kind(kind), doc_id, body)
        except ValueError as exc:
            raise HTTPException(413, str(exc)) from exc

    @app.delete("/api/teacher/workspace/{kind}/{doc_id}")
    def delete_workspace_doc(kind: str, doc_id: str, account: dict[str, Any] = Depends(teacher_account)):
        workspace.delete(account["id"], workspace_kind(kind), doc_id)
        return {"deleted": True}

    @app.post("/api/teacher/workspace/profiles/{profile_id}/reset-pictures")
    def reset_learner_pictures(profile_id: str, account: dict[str, Any] = Depends(teacher_account)):
        return {"reset": auth_store.reset_pictures(account["id"], profile_id)}

    @app.get("/api/teacher/insights")
    def class_insights(class_id: str, account: dict[str, Any] = Depends(teacher_account)):
        return activity.insights(account["id"], class_id)

    # ------------------------------------------------------------ teaching materials (on the server)

    @app.get("/api/teacher/resources")
    def list_resources(account: dict[str, Any] = Depends(teacher_account)):
        return {"resources": resources.list(account["id"])}

    @app.post("/api/teacher/resources", status_code=201)
    def upload_resource(req: ResourceRequest, account: dict[str, Any] = Depends(teacher_account)):
        try:
            data = base64.b64decode(req.content_base64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(422, "The file could not be uploaded. Please try again.") from exc
        if not data:
            raise HTTPException(422, "That file is empty.")
        limit = min(MAX_RESOURCE_BYTES, int(settings.max_upload_mb * 1024 * 1024))
        if len(data) > limit:
            raise HTTPException(413, f"That file is larger than {settings.max_upload_mb:g} MB. Choose a smaller file.")
        text, note = "", None
        if req.filename.lower().endswith(READABLE_TYPES):
            try:
                text = extract_text(req.filename, data)
            except UnreadableDocument as exc:
                note = str(exc)
            if not text and not note:
                note = "No text was found in this file (it may be a scanned image)."
        else:
            note = "Saved. Mothusi can only read the text of PDF, Word (.docx) and text files."
        meta = req.model_dump(include={"title", "grade", "subject", "type", "topic"})
        mime = RESOURCE_MIME[req.filename.lower()[req.filename.rfind("."):]]  # never trust the browser's type
        saved = resources.add(account["id"], {k: v.strip() for k, v in meta.items()}, req.filename, mime, data, text)
        return {**saved, "note": note}

    def owned_resource(account: dict[str, Any], resource_id: str) -> dict[str, Any]:
        found = resources.get(account["id"], resource_id)
        if not found:
            raise HTTPException(404, "Material not found.")
        return found

    @app.get("/api/teacher/resources/{resource_id}/text")
    def resource_text(resource_id: str, account: dict[str, Any] = Depends(teacher_account)):
        found = owned_resource(account, resource_id)
        return {"id": found["id"], "title": found["title"], "text": resources.text(account["id"], resource_id) or ""}

    @app.get("/api/teacher/resources/{resource_id}/file")
    def resource_file(resource_id: str, account: dict[str, Any] = Depends(teacher_account)):
        owned_resource(account, resource_id)
        filename, mime, data = resources.file(account["id"], resource_id)
        safe = re.sub(r'[^A-Za-z0-9._ -]', "_", filename)
        return Response(data, media_type=mime or "application/octet-stream",
                        headers={"Content-Disposition": f'inline; filename="{safe}"',
                                 "X-Content-Type-Options": "nosniff"})

    @app.delete("/api/teacher/resources/{resource_id}")
    def delete_resource(resource_id: str, account: dict[str, Any] = Depends(teacher_account)):
        return {"deleted": resources.delete(account["id"], resource_id)}

    # ------------------------------------------------------------ classroom codes

    @app.get("/api/teacher/roster")
    def roster(account: dict[str, Any] = Depends(teacher_account)):
        return {**auth_store.teacher_roster(account["id"]),
                "picture_profiles": sorted(auth_store.picture_profiles(account["id"]))}

    @app.post("/api/teacher/join-codes", status_code=201)
    def issue_code(req: JoinCodeRequest, account: dict[str, Any] = Depends(teacher_account)):
        return auth_store.issue_code(account["id"], req.class_id, req.class_name.strip(),
                                     req.learner_profile_id, (req.learner_label or "").strip() or None)

    @app.delete("/api/teacher/join-codes/{code}")
    def revoke_code(code: str, account: dict[str, Any] = Depends(teacher_account)):
        if not auth_store.revoke_code(account["id"], code):
            raise HTTPException(404, "Code not found.")
        return {"revoked": True}

    @app.delete("/api/teacher/learners/{learner_account_id}")
    def unlink_learner(learner_account_id: str, account: dict[str, Any] = Depends(teacher_account)):
        if not auth_store.unlink_learner(account["id"], learner_account_id):
            raise HTTPException(404, "Learner not found.")
        return {"unlinked": True}

    # ------------------------------------------------------------ learner portal

    @app.get("/api/learner/link")
    def my_class(account: dict[str, Any] = Depends(learner_account)):
        return {"link": learner_link(account)}

    @app.post("/api/learner/join")
    def join_class(req: CodeRequest, account: dict[str, Any] = Depends(learner_account)):
        link = auth_store.redeem_code(req.code, account["id"])
        if link is None:
            raise HTTPException(400, "That code is not valid. Check it with your teacher.")
        return {"link": link}

    @app.post("/api/learner/activity", status_code=201)
    def learner_activity(req: ActivityRequest, account: dict[str, Any] = Depends(learner_account)):
        link = learner_link(account)
        if link is None or lesson_for_learner(req.run_id, link) is None:
            raise HTTPException(404, "Lesson not found.")
        if len(json.dumps(req.data)) > 4000:
            raise HTTPException(413, "Too much data.")
        activity.record(account_id=account["id"], link=link, run_id=req.run_id, kind=req.kind, data=req.data)
        return {"ok": True}

    @app.get("/api/learner/progress")
    def learner_progress(account: dict[str, Any] = Depends(learner_account)):
        return activity.progress_for_learner(account["id"])

    @app.get("/api/learner/lessons")
    def learner_lessons(account: dict[str, Any] = Depends(learner_account)):
        link = learner_link(account)
        if link is None:
            return {"lessons": [], "linked": False}
        lessons, seen = [], set()
        for run in store.approved_plans(link["teacher_id"], link["class_id"]):
            pack = run["result"]["pack"]
            key = run["lesson_id"] or run["id"]
            if key in seen:
                continue  # only the newest approved version of each lesson
            seen.add(key)
            lessons.append({"run_id": run["id"], "title": pack["title"], "grade": pack["grade"],
                            "subject": pack["subject"], "topic": pack["topic"], "approved_at": run["approved_at"]})
        return {"lessons": lessons, "linked": True}

    @app.get("/api/learner/lesson")
    def learner_lesson(language: str = "en", run_id: str | None = None,
                       account: dict[str, Any] = Depends(learner_account)):
        link = learner_link(account)
        if link is None:
            return {"lesson": None, "linked": False}
        if run_id:
            run = lesson_for_learner(run_id, link)
        else:
            latest = store.approved_plans(link["teacher_id"], link["class_id"], limit=1)
            run = latest[0] if latest else None
        if run is None:
            return {"lesson": None, "linked": True}
        pack = run["result"]["pack"]
        profile_id = link["learner_profile_id"]
        learner = next((l for l in pack["learners"] if profile_id and l["id"] == profile_id), None)
        material = (learner or {}).get("material") or pack["whole_class"]["material"]
        shown_language, note = "en", None
        translation = (learner or {}).get("translation")
        if language != "en":
            if translation and translation["language"] == language and translation["status"] == "checked":
                material, shown_language = translation["material"], language
                note = "translated_ai_draft"
            else:
                note = "language_unavailable"
        return {"linked": True, "lesson": {
            "run_id": run["id"], "title": pack["title"], "grade": pack["grade"], "subject": pack["subject"],
            "topic": pack["topic"], "objective": pack["objective"], "success_criteria": pack["success_criteria"],
            "personalised": bool(learner and learner.get("material")), "material": material,
            "offline_demo": "(live)" not in (run.get("model") or ""),
            "language": shown_language, "note": note,
        }}

    @app.post("/api/learner/explain", status_code=202)
    def learner_explain(ask: ExplainRequest, account: dict[str, Any] = Depends(learner_account)):
        link = learner_link(account)
        parent = lesson_for_learner(ask.run_id, link) if link else None
        if parent is None:
            raise HTTPException(404, "Lesson not found.")
        ask = ask.model_copy(update={"learner_id": link["learner_profile_id"]})
        activity.record(account_id=account["id"], link=link, run_id=ask.run_id, kind="explain",
                        data={"style": ask.style, "language": ask.language, "topic": parent["result"]["pack"]["topic"]})
        run_id = runs.start(kind="explain", title=f"Learner explanation: {parent['title'].split(': ', 1)[-1]}",
                            request=ask.model_dump(), offline=bool(parent["request"].get("offline")),
                            parent_run_id=ask.run_id, lesson_id=parent["lesson_id"],
                            owner_id=link["teacher_id"], class_id=link["class_id"],
                            job=lambda trace, llm: orchestrator.explain(trace, llm, parent, ask))
        return {"run_id": run_id, "learner_run": True}

    def learner_explain_run(run_id: str, account: dict[str, Any]) -> dict:
        """A learner may follow only explanation runs for their own class."""
        link = learner_link(account)
        run = store.get_run(run_id)
        if (run is None or link is None or run["kind"] != "explain" or run["owner_id"] != link["teacher_id"]
                or run["class_id"] != link["class_id"]):
            raise HTTPException(404, "Run not found.")
        return run

    @app.get("/api/learner/runs/{run_id}")
    def learner_run(run_id: str, account: dict[str, Any] = Depends(learner_account)):
        expire_stale_runs()
        run = learner_explain_run(run_id, account)
        return {"id": run["id"], "status": run["status"], "error": run["error"], "result": run["result"]}

    @app.post("/api/learner/runs/{run_id}/execute")
    async def learner_execute(run_id: str, account: dict[str, Any] = Depends(learner_account)):
        learner_explain_run(run_id, account)
        return await execute(run_id)

    @app.get("/api/learner/runs/{run_id}/events")
    async def learner_run_events(run_id: str, request: Request, account: dict[str, Any] = Depends(learner_account)):
        learner_explain_run(run_id, account)
        return event_stream(run_id, request)

    return app
