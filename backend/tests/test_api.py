import json
import time

import pytest
from fastapi.testclient import TestClient

from api.routes import create_app
from tests.conftest import DEMO


@pytest.fixture
def client(settings):
    return TestClient(create_app(settings))


def wait(client, run_id):
    for _ in range(200):
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] != "running":
            return run
        time.sleep(0.02)
    raise AssertionError("run did not finish")


def test_health_reports_model(client):
    body = client.get("/api/health").json()
    assert body == {"status": "ok", "model": "Offline demo model", "live": False, "can_translate": False}


def test_rejects_out_of_scope_grade(client):
    res = client.post("/api/runs", json={**DEMO, "grade": "Grade 9"})
    assert res.status_code == 422


def test_full_flow_plan_stream_approve_learner(client):
    run_id = client.post("/api/runs", json=DEMO).json()["run_id"]
    run = wait(client, run_id)
    assert run["status"] == "completed_with_warnings"
    assert run["result"]["pack"]["title"] == "Grade 4 Mathematics: Fractions"

    with client.stream("GET", f"/api/runs/{run_id}/events") as stream:
        body = "".join(stream.iter_text())
    events = [json.loads(line[6:]) for line in body.splitlines() if line.startswith("data: {\"")]
    assert events[0]["type"] == "run_started" and events[-1]["type"] == "run_completed"
    assert [e["seq"] for e in events] == list(range(1, len(events) + 1))
    assert "event: end" in body

    with client.stream("GET", f"/api/runs/{run_id}/events", headers={"Last-Event-ID": str(len(events) - 1)}) as stream:
        resumed = [l for l in "".join(stream.iter_text()).splitlines() if l.startswith("data: {\"")]
    assert len(resumed) == 1

    assert client.get("/api/learner/lesson").json() == {"lesson": None}
    assert client.post(f"/api/runs/{run_id}/approve").json() == {"approved": True}
    lesson = client.get("/api/learner/lesson", params={"code": "L-003", "language": "tn"}).json()["lesson"]
    assert lesson["personalised"] and lesson["note"] == "language_unavailable"
    assert lesson["material"]["practice"]

    explain_id = client.post("/api/learner/explain", json={"run_id": run_id, "learner_code": "L-001",
                                                            "style": "visual"}).json()["run_id"]
    explained = wait(client, explain_id)
    assert explained["status"] == "completed"
    assert "Draw a picture" in " ".join(explained["result"]["material"]["explanation"])


def test_replan_recheck_and_feedback(client):
    run_id = client.post("/api/runs", json=DEMO).json()["run_id"]
    plan = wait(client, run_id)

    noisy = {**DEMO["constraints"], "noisy_venue": True}
    replan = wait(client, client.post(f"/api/runs/{run_id}/replan", json={"constraints": noisy}).json()["run_id"])
    assert replan["kind"] == "replan" and replan["parent_run_id"] == run_id
    assert replan["result"]["changes"]

    edited = [dict(a) for a in plan["result"]["state"]["adaptations"]]
    edited[0]["teacher_minutes"] = 30
    recheck = wait(client, client.post(f"/api/runs/{run_id}/recheck", json={"adaptations": edited}).json()["run_id"])
    assert recheck["result"]["passed"] is False
    assert any(i["check"] == "teacher_time" for i in recheck["result"]["issues"])

    a = plan["result"]["state"]["adaptations"][0]
    fb = {"run_id": run_id, "overall": "Worked well", "outcomes": [
        {"adaptation_id": a["id"], "learner_id": a["learner_id"], "strategy": a["strategy"], "outcome": "Worked"}]}
    fb_run = wait(client, client.post("/api/feedback", json=fb).json()["run_id"])
    assert fb_run["status"] == "completed" and fb_run["model"] == "none"
    memory = client.get("/api/memory", params={"learner_id": a["learner_id"]}).json()["feedback"]
    assert {m["outcome"] for m in memory} == {"Worked"}

    listing = client.get("/api/runs").json()["runs"]
    assert {r["kind"] for r in listing} == {"plan", "replan", "recheck", "feedback"}


def test_replan_needs_a_change(client):
    run_id = client.post("/api/runs", json=DEMO).json()["run_id"]
    wait(client, run_id)
    assert client.post(f"/api/runs/{run_id}/replan", json={}).status_code == 422
    assert client.post("/api/runs/nope/replan", json={"teacher_note": "shorter"}).status_code == 404


def test_learner_lesson_list_and_specific_lesson(client):
    first = client.post("/api/runs", json=DEMO).json()["run_id"]
    wait(client, first)
    second = client.post("/api/runs", json={**DEMO, "topic": "Sharing equally"}).json()["run_id"]
    wait(client, second)
    assert client.get("/api/learner/lessons").json() == {"lessons": []}
    client.post(f"/api/runs/{first}/approve")
    client.post(f"/api/runs/{second}/approve")
    lessons = client.get("/api/learner/lessons").json()["lessons"]
    assert [l["topic"] for l in lessons] == ["Sharing equally", "Fractions"]
    lesson = client.get("/api/learner/lesson", params={"run_id": first, "code": "L-001"}).json()["lesson"]
    assert lesson["topic"] == "Fractions" and lesson["objective"] and lesson["personalised"]
    unapproved = client.post("/api/runs", json=DEMO).json()["run_id"]
    wait(client, unapproved)
    assert client.get("/api/learner/lesson", params={"run_id": unapproved}).json() == {"lesson": None}
