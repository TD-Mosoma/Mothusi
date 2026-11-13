import json
import time

import pytest
from fastapi.testclient import TestClient

from api.routes import create_app
from models.curriculum import LANGUAGES
from models.schemas import LearnerProfile
from tests.conftest import DEMO as BASE_DEMO

DEMO = {**BASE_DEMO, "class_id": "c1"}


@pytest.fixture
def client(settings):
    client = TestClient(create_app(settings))
    response = client.post("/api/auth/register/teacher", json={
        "email": "teacher@example.org",
        "password": "teacher-pass-123",
        "profile": {"fullName": "Test Teacher"},
    })
    assert response.status_code == 201
    client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return client


@pytest.fixture
def learner_client(settings):
    client = TestClient(create_app(settings))
    response = client.post("/api/auth/register/learner", json={
        "email": "learner@example.org",
        "password": "learner-pass-123",
        "profile": {"fullName": "Test Learner"},
    })
    assert response.status_code == 201
    client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return client


@pytest.fixture
def unauthenticated_client(settings):
    return TestClient(create_app(settings))


def join(teacher, learner, profile_id=None, class_id="c1", label=None):
    """The teacher issues a code and the learner joins with it."""
    code = teacher.post("/api/teacher/join-codes", json={
        "class_id": class_id, "class_name": "Grade 4A", "learner_profile_id": profile_id,
        "learner_label": label}).json()["code"]
    res = learner.post("/api/learner/join", json={"code": code})
    assert res.status_code == 200, res.text
    return code


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


def test_registration_login_and_role_access(client, learner_client):
    assert client.get("/api/auth/me").json()["user"]["role"] == "teacher"
    assert "password" not in client.get("/api/auth/me").json()["user"]["profile"]
    assert learner_client.get("/api/auth/me").json()["user"]["role"] == "learner"
    assert client.get("/api/learner/lessons").status_code == 403
    assert learner_client.get("/api/runs").status_code == 403
    assert client.post("/api/auth/register/learner", json={
        "email": "learner@example.org", "password": "learner-pass-123", "profile": {"fullName": "Again"},
    }).status_code == 409
    login = client.post("/api/auth/login", json={"email": "teacher@example.org", "password": "teacher-pass-123"})
    assert login.status_code == 200 and login.json()["user"]["role"] == "teacher"
    assert client.post("/api/auth/login", json={"email": "teacher@example.org", "password": "wrong-pass"}).status_code == 401
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_account_and_session_persist_across_app_restart(client, settings):
    reopened = TestClient(create_app(settings))
    response = reopened.get("/api/auth/me", headers={
        "Authorization": client.headers["Authorization"],
    })
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "teacher"


def test_profile_email_change_updates_login_identity(client):
    response = client.patch("/api/auth/profile", json={
        "fullName": "Updated Teacher", "email": "new-teacher@example.org",
    })
    assert response.status_code == 200
    assert response.json()["user"]["email"] == "new-teacher@example.org"
    assert client.post("/api/auth/login", json={
        "email": "new-teacher@example.org", "password": "teacher-pass-123",
    }).status_code == 200


def test_protected_routes_require_login(unauthenticated_client):
    assert unauthenticated_client.get("/api/health").status_code == 200
    assert unauthenticated_client.get("/api/runs").status_code == 401
    assert unauthenticated_client.get("/api/learner/lessons").status_code == 401


def test_rejects_out_of_scope_grade(client):
    res = client.post("/api/runs", json={**DEMO, "grade": "Grade 9"})
    assert res.status_code == 422


def test_curriculum_and_learner_profiles_include_supported_languages(client):
    expected = {"en", "tn", "zu", "xh", "af", "st", "ve", "nso", "nr", "ss", "ts"}
    assert set(client.get("/api/curriculum").json()["languages"]) == expected
    assert set(LANGUAGES) == expected
    for language in expected:
        assert LearnerProfile(id="learner", name="Learner", language=language).language == language


def test_full_flow_plan_stream_approve_learner(client, learner_client):
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

    assert learner_client.get("/api/learner/lesson").json() == {"lesson": None, "linked": False}
    join(client, learner_client, profile_id="lr3", label="Learner C")
    assert learner_client.get("/api/learner/lesson").json() == {"lesson": None, "linked": True}
    assert client.post(f"/api/runs/{run_id}/approve").json() == {"approved": True}
    lesson = learner_client.get("/api/learner/lesson", params={"language": "tn"}).json()["lesson"]
    assert lesson["personalised"] and lesson["note"] == "language_unavailable"
    assert lesson["material"]["practice"]

    explain_id = learner_client.post("/api/learner/explain", json={"run_id": run_id, "style": "visual"}).json()["run_id"]
    for _ in range(200):
        explained = learner_client.get(f"/api/learner/runs/{explain_id}").json()
        if explained["status"] != "running":
            break
        time.sleep(0.02)
    assert explained["status"] == "completed"
    assert "Draw a picture" in " ".join(explained["result"]["material"]["explanation"])
    with learner_client.stream("GET", f"/api/learner/runs/{explain_id}/events") as stream:
        assert "event: end" in "".join(stream.iter_text())
    assert learner_client.get(f"/api/learner/runs/{run_id}").status_code == 404
    assert any(r["kind"] == "explain" for r in client.get("/api/runs").json()["runs"])


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


def test_learner_lesson_list_and_specific_lesson(client, learner_client):
    first = client.post("/api/runs", json=DEMO).json()["run_id"]
    wait(client, first)
    second = client.post("/api/runs", json={**DEMO, "topic": "Sharing equally"}).json()["run_id"]
    wait(client, second)
    join(client, learner_client, profile_id="lr1", label="Learner A")
    assert learner_client.get("/api/learner/lessons").json() == {"lessons": [], "linked": True}
    client.post(f"/api/runs/{first}/approve")
    client.post(f"/api/runs/{second}/approve")
    lessons = learner_client.get("/api/learner/lessons").json()["lessons"]
    assert [l["topic"] for l in lessons] == ["Sharing equally", "Fractions"]
    lesson = learner_client.get("/api/learner/lesson", params={"run_id": first}).json()["lesson"]
    assert lesson["topic"] == "Fractions" and lesson["objective"] and lesson["personalised"]
    unapproved = client.post("/api/runs", json=DEMO).json()["run_id"]
    wait(client, unapproved)
    assert learner_client.get("/api/learner/lesson", params={"run_id": unapproved}).json()["lesson"] is None


def test_learner_lesson_says_when_it_came_from_the_offline_model(client, learner_client):
    run_id = client.post("/api/runs", json=DEMO).json()["run_id"]
    wait(client, run_id)
    client.post(f"/api/runs/{run_id}/approve")
    join(client, learner_client)
    lesson = learner_client.get("/api/learner/lesson").json()["lesson"]
    assert lesson["offline_demo"] is True and not lesson["personalised"]


def test_profiles_have_a_size_limit(client, unauthenticated_client):
    huge = {"fullName": "Big Profile", "notes": "x" * 9000}
    res = unauthenticated_client.post("/api/auth/register/learner", json={
        "email": "big@example.org", "password": "learner-pass-123", "profile": huge})
    assert res.status_code == 422
    assert client.patch("/api/auth/profile", json={"notes": "x" * 9000}).status_code == 413
    assert client.patch("/api/auth/profile", json={"school": "Example Primary"}).status_code == 200


# ---------------------------------------------------------------- codes and isolation

@pytest.fixture
def other_teacher(settings):
    other = TestClient(create_app(settings))
    res = other.post("/api/auth/register/teacher", json={
        "email": "other@example.org", "password": "other-pass-123", "profile": {"fullName": "Other Teacher"}})
    other.headers["Authorization"] = f"Bearer {res.json()['access_token']}"
    return other


def register_learner(settings, email, code=None):
    c = TestClient(create_app(settings))
    profile = {"fullName": "New Learner", **({"code": code} if code else {})}
    res = c.post("/api/auth/register/learner", json={"email": email, "password": "learner-pass-123", "profile": profile})
    if res.status_code == 201:
        c.headers["Authorization"] = f"Bearer {res.json()['access_token']}"
    return c, res


def test_teachers_only_see_their_own_runs_and_memory(client, other_teacher):
    run_id = client.post("/api/runs", json=DEMO).json()["run_id"]
    plan = wait(client, run_id)
    a = plan["result"]["state"]["adaptations"][0]
    wait(client, client.post("/api/feedback", json={"run_id": run_id, "overall": "Worked well", "outcomes": [
        {"adaptation_id": a["id"], "learner_id": a["learner_id"], "strategy": a["strategy"], "outcome": "Did not work"}]}
    ).json()["run_id"])

    assert other_teacher.get("/api/runs").json()["runs"] == []
    for path in (f"/api/runs/{run_id}", f"/api/runs/{run_id}/events"):
        assert other_teacher.get(path).status_code == 404
    for path, body in ((f"/api/runs/{run_id}/approve", None), (f"/api/runs/{run_id}/replan", {"teacher_note": "x y z"}),
                       ("/api/feedback", {"run_id": run_id, "overall": "Worked well"})):
        assert other_teacher.post(path, json=body).status_code == 404
    # Same learner id in another teacher's class: their memory stays empty.
    assert other_teacher.get("/api/memory", params={"learner_id": a["learner_id"]}).json()["feedback"] == []
    theirs = wait(other_teacher, other_teacher.post("/api/runs", json=DEMO).json()["run_id"])
    recalled = next(e for e in other_teacher.get(f"/api/runs/{theirs['id']}?events=true").json()["events"]
                    if e["agent"] == "Progress Tracker" and e["type"] == "agent_output")
    assert recalled["title"] == "No earlier feedback for these learners"


def test_personal_codes_are_single_use_and_can_be_revoked(client, settings):
    code = client.post("/api/teacher/join-codes", json={
        "class_id": "c1", "class_name": "Grade 4A", "learner_profile_id": "lr2", "learner_label": "Learner B"}).json()["code"]
    assert len(code) == 9 and code[4] == "-"
    assert client.post("/api/auth/check-code", json={"code": code.lower().replace("-", " ")}).json() == {"valid": True}

    learner, res = register_learner(settings, "b@example.org", code)
    assert res.status_code == 201 and res.json()["link"]["learner_profile_id"] == "lr2"
    assert "code" not in res.json()["user"]["profile"]
    _, again = register_learner(settings, "b2@example.org", code)
    assert again.status_code == 400

    roster = client.get("/api/teacher/roster").json()
    assert [l["learner_label"] for l in roster["learners"]] == ["Learner B"]
    assert all(c["code"] != code for c in roster["codes"])

    replaced = client.post("/api/teacher/join-codes", json={"class_id": "c1", "class_name": "Grade 4A"}).json()["code"]
    newer = client.post("/api/teacher/join-codes", json={"class_id": "c1", "class_name": "Grade 4A"}).json()["code"]
    assert client.post("/api/auth/check-code", json={"code": replaced}).json() == {"valid": False}
    assert client.delete(f"/api/teacher/join-codes/{newer}").json() == {"revoked": True}
    assert client.post("/api/auth/check-code", json={"code": newer}).json() == {"valid": False}

    account_id = roster["learners"][0]["account_id"]
    assert client.delete(f"/api/teacher/learners/{account_id}").json() == {"unlinked": True}
    assert learner.get("/api/learner/link").json() == {"link": None}


def test_class_codes_are_shared_and_learners_only_see_their_class(client, other_teacher, settings):
    code = client.post("/api/teacher/join-codes", json={"class_id": "c1", "class_name": "Grade 4A"}).json()["code"]
    first, _ = register_learner(settings, "one@example.org", code)
    second, _ = register_learner(settings, "two@example.org", code)
    for learner in (first, second):
        link = learner.get("/api/learner/link").json()["link"]
        assert link["class_name"] == "Grade 4A" and link["teacher_name"] == "Test Teacher"
        assert link["learner_profile_id"] is None

    other_class = client.post("/api/runs", json={**DEMO, "class_id": "c2"}).json()["run_id"]
    wait(client, other_class)
    client.post(f"/api/runs/{other_class}/approve")
    other_teacher_run = other_teacher.post("/api/runs", json=DEMO).json()["run_id"]
    wait(other_teacher, other_teacher_run)
    other_teacher.post(f"/api/runs/{other_teacher_run}/approve")

    assert first.get("/api/learner/lessons").json()["lessons"] == []
    for run_id in (other_class, other_teacher_run):
        assert first.get("/api/learner/lesson", params={"run_id": run_id}).json()["lesson"] is None
        assert first.post("/api/learner/explain", json={"run_id": run_id}).status_code == 404


def test_learners_cannot_claim_a_profile_by_editing_their_account(client, learner_client):
    learner_client.patch("/api/auth/profile", json={"code": "L-003", "fullName": "Still Me"})
    assert learner_client.get("/api/learner/link").json() == {"link": None}
    assert "code" not in learner_client.get("/api/auth/me").json()["user"]["profile"]
    assert learner_client.post("/api/learner/join", json={"code": "AAAA-BBBB"}).status_code == 400
