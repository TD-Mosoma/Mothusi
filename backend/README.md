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
| POST | `/api/runs` | Start a lesson plan (returns `run_id`) |
| GET | `/api/runs/{id}/events` | Live Server-Sent Events stream; replays stored runs; resumes with `Last-Event-ID` |
| GET | `/api/runs/{id}` | Run status, request and result (`?events=true` adds the trace) |
| GET | `/api/runs` | Recent runs for the Agent Activity page |
| POST | `/api/runs/{id}/replan` | Re-plan after a condition change or teacher note |
| POST | `/api/runs/{id}/recheck` | Review a teacher-edited plan |
| POST | `/api/runs/{id}/approve` | Approve and share with learners |
| POST | `/api/feedback` | Record post-lesson feedback (Progress Tracker) |
| GET | `/api/memory` | Stored feedback for learners |
| GET | `/api/learner/lessons` | Lessons teachers have approved for learners, newest first |
| GET | `/api/learner/lesson` | An approved lesson (`run_id`, or the latest) for a learner code and language |
| POST | `/api/learner/explain` | "Explain it another way" for a learner |
