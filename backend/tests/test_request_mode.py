"""Request mode: how Mothusi runs on serverless hosts such as Vercel. A run is only saved when it is created; the
browser's call to /execute runs it, and any server instance streams its saved events."""

import dataclasses

from fastapi.testclient import TestClient

from api.routes import create_app
from tests.conftest import DEMO as BASE_DEMO
from tests.test_classroom import teacher

DEMO = {**BASE_DEMO, "class_id": "c1"}


def serverless(settings):
    return dataclasses.replace(settings, run_mode="request", run_deadline_seconds=60)


def run_and_finish(client, run_id, prefix="/api"):
    assert client.get(f"{prefix}/runs/{run_id}").json()["status"] == "running"
    assert client.post(f"{prefix}/runs/{run_id}/execute").json() == {"status": "done"}
    assert client.post(f"{prefix}/runs/{run_id}/execute").json() == {"status": "taken"}  # never runs twice
    return client.get(f"{prefix}/runs/{run_id}").json()


def test_every_kind_of_run_executes_on_request(settings):
    s = serverless(settings)
    t = teacher(s)
    assert t.get("/api/health").json()["run_mode"] == "request"

    plan_id = t.post("/api/runs", json=DEMO).json()["run_id"]
    plan = run_and_finish(t, plan_id)
    assert plan["status"].startswith("completed") and plan["result"]["pack"]["topic"] == "Fractions"

    # Another server instance (a fresh app on the same database) streams the saved events to the end.
    other = TestClient(create_app(s), headers=t.headers)
    with other.stream("GET", f"/api/runs/{plan_id}/events") as stream:
        body = "".join(stream.iter_text())
    assert "run_completed" in body and body.rstrip().endswith("data: {}")
    with other.stream("GET", f"/api/runs/{plan_id}/events", headers={"Last-Event-ID": "3"}) as stream:
        resumed = "".join(stream.iter_text())
    assert "id: 3\n" not in resumed and "id: 4\n" in resumed

    replan_id = t.post(f"/api/runs/{plan_id}/replan", json={"teacher_note": "One instruction at a time for Learner B."}).json()["run_id"]
    assert run_and_finish(t, replan_id)["status"].startswith("completed")

    adaptations = plan["result"]["state"]["adaptations"]
    recheck_id = t.post(f"/api/runs/{plan_id}/recheck", json={"adaptations": adaptations}).json()["run_id"]
    assert run_and_finish(t, recheck_id)["status"].startswith("completed")

    t.post(f"/api/runs/{plan_id}/approve")
    fb = {"run_id": plan_id, "overall": "Worked well", "outcomes": [{
        "adaptation_id": adaptations[0]["id"], "learner_id": adaptations[0]["learner_id"], "learner_label": "Learner A",
        "strategy": adaptations[0]["strategy"], "instruction": adaptations[0]["instruction"], "outcome": "Worked"}]}
    feedback_id = t.post("/api/feedback", json=fb).json()["run_id"]
    assert run_and_finish(t, feedback_id)["status"] == "completed"

    # A learner's "explain it another way" runs through the learner endpoints.
    code = t.post("/api/teacher/join-codes", json={"class_id": "c1", "class_name": "Grade 4A"}).json()["code"]
    learner = TestClient(create_app(s))
    session = learner.post("/api/auth/register/learner", json={"email": "kid@example.org", "password": "learner-pass-1",
                                                               "profile": {"fullName": "Kid"}}).json()
    learner.headers["Authorization"] = f"Bearer {session['access_token']}"
    learner.post("/api/learner/join", json={"code": code})
    explain_id = learner.post("/api/learner/explain", json={"run_id": plan_id, "style": "visual"}).json()["run_id"]
    explained = run_and_finish(learner, explain_id, "/api/learner")
    assert explained["status"].startswith("completed") and explained["result"]["material"]
    # The teacher owns their learners' explanation runs (they appear in "How Mothusi worked"); it already ran once.
    assert t.post(f"/api/runs/{explain_id}/execute").json() == {"status": "taken"}


def test_runs_that_never_start_or_outlive_their_function_end_as_failed(settings):
    s = serverless(settings)
    t = teacher(s)
    run_id = t.post("/api/runs", json=DEMO).json()["run_id"]
    db = create_app(s).state.store
    db.db.run("UPDATE runs SET created_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", (run_id,))
    stale = t.get(f"/api/runs/{run_id}").json()
    assert stale["status"] == "failed" and "stopped before it finished" in stale["error"]
    assert t.post(f"/api/runs/{run_id}/execute").json() == {"status": "taken"}


def test_upload_limit_follows_the_host(settings):
    import base64
    t = teacher(dataclasses.replace(settings, max_upload_mb=0.001))
    big = base64.b64encode(b"x" * 5000).decode()
    res = t.post("/api/teacher/resources", json={"title": "Big", "grade": "Grade 4", "subject": "Mathematics",
                                                 "type": "Worksheet", "filename": "big.txt", "content_base64": big})
    assert res.status_code == 413 and "0.001 MB" in res.json()["detail"]
