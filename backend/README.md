# Mothusi backend

FastAPI service that runs Mothusi's agent workflows, built on LangGraph. See the root README for the architecture and demo script.

```bash
cp .env.example .env
uv sync
uv run uvicorn main:app --reload --port 8000
uv run pytest
uv run python -m scripts.demo --offline
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Which model the agents use |
| GET | `/api/graph` | The LangGraph workflow's nodes and edges, for the live graph |
| POST | `/api/auth/register/learner` | Create a learner account and session |
| POST | `/api/auth/register/teacher` | Create a teacher account and session |
| POST | `/api/auth/login` | Sign in with email and password; returns the account role |
| GET | `/api/auth/me` | Current authenticated account |
| POST | `/api/auth/logout` | Revoke the current session |
| PATCH | `/api/auth/profile` | Update the current account profile |
| POST | `/api/runs` | Start a lesson plan (teacher; returns `run_id`) |
| GET | `/api/runs/{id}/events` | Teacher-only live Server-Sent Events stream; replays stored runs; resumes with `Last-Event-ID` |
| GET | `/api/runs/{id}` | Teacher-only run status, request and result (`?events=true` adds the trace) |
| GET | `/api/runs` | Teacher-only recent runs for the How Mothusi worked page |
| POST | `/api/runs/{id}/replan` | Teacher-only re-plan after a condition change or teacher note |
| POST | `/api/runs/{id}/recheck` | Teacher-only review of an edited plan |
| POST | `/api/runs/{id}/approve` | Teacher-only approval and sharing with learners |
| POST | `/api/feedback` | Teacher-only post-lesson feedback (Progress Tracker) |
| GET | `/api/memory` | Teacher-only stored feedback for learners |
| GET | `/api/learner/lessons` | Learner-only lessons approved by a teacher, newest first |
| GET | `/api/learner/lesson` | Learner-only approved lesson (`run_id`, or the latest) for the signed-in learner |
| POST | `/api/learner/explain` | Learner-only "Explain it another way" |
| POST | `/api/learner/activity` | Learner-only: record `opened`, `answer`, `practice_done` or `reflection` for a lesson |
| GET | `/api/learner/progress` | Learner-only: their own practice record |
| POST | `/api/auth/picture/roster` | Class code → class name and the names on its list |
| POST | `/api/auth/picture/setup` | First picture sign-in: choose three pictures (409 if already set) |
| POST | `/api/auth/picture/login` | Picture sign-in (401 wrong, 409 not set up, 423 locked for 10 minutes) |
| POST | `/api/auth/forgot` | Email a password-reset link (always answers `ok`) |
| POST | `/api/auth/reset` | Set a new password with a reset token; ends every session |
| GET | `/api/teacher/workspace` | Teacher-only: their classes, profiles and lesson plans |
| PUT / DELETE | `/api/teacher/workspace/{classes\|profiles\|lessons}/{id}` | Teacher-only: save or remove one record |
| POST | `/api/teacher/workspace/profiles/{id}/reset-pictures` | Teacher-only: a learner chooses new pictures next time |
| GET | `/api/teacher/insights?class_id=` | Teacher-only: what learners did with each shared lesson, and per learner |
| GET / POST | `/api/teacher/resources` | Teacher-only: list or upload materials (base64, up to 10 MB; text read from PDF, .docx, .txt) |
| GET | `/api/teacher/resources/{id}/text` / `file` | Teacher-only: the material's readable text, or the file |
| DELETE | `/api/teacher/resources/{id}` | Teacher-only: delete a material |

Protected requests use `Authorization: Bearer <access_token>`. Passwords are stored as PBKDF2-SHA256 hashes; session
tokens are opaque, stored hashed in SQLite, and expire after 30 days.
