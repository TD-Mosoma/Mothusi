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
| GET | `/api/runs` | Teacher-only recent runs for the Agent Activity page |
| POST | `/api/runs/{id}/replan` | Teacher-only re-plan after a condition change or teacher note |
| POST | `/api/runs/{id}/recheck` | Teacher-only review of an edited plan |
| POST | `/api/runs/{id}/approve` | Teacher-only approval and sharing with learners |
| POST | `/api/feedback` | Teacher-only post-lesson feedback (Progress Tracker) |
| GET | `/api/memory` | Teacher-only stored feedback for learners |
| GET | `/api/learner/lessons` | Learner-only lessons approved by a teacher, newest first |
| GET | `/api/learner/lesson` | Learner-only approved lesson (`run_id`, or the latest) for the signed-in learner |
| POST | `/api/learner/explain` | Learner-only "Explain it another way" |

Protected requests use `Authorization: Bearer <access_token>`. Passwords are stored as PBKDF2-SHA256 hashes; session
tokens are opaque, stored hashed in SQLite, and expire after 30 days.
