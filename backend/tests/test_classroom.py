import dataclasses
import time

import pytest
from fastapi.testclient import TestClient

from api.routes import create_app
from tests.conftest import DEMO as BASE_DEMO

DEMO = {**BASE_DEMO, "class_id": "c1"}


def teacher(settings, email="t@example.org", name="Thandi Teacher"):
    c = TestClient(create_app(settings))
    res = c.post("/api/auth/register/teacher", json={"email": email, "password": "teacher-pass-123",
                                                      "profile": {"fullName": name}})
    c.headers["Authorization"] = f"Bearer {res.json()['access_token']}"
    return c


def wait(client, run_id):
    for _ in range(300):
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] != "running":
            return run
        time.sleep(0.02)
    raise AssertionError("run did not finish")


def setup_class(t):
    t.put("/api/teacher/workspace/classes/c1", json={"name": "Grade 4A", "grade": "Grade 4", "subjects": ["Mathematics"]})
    for pid, name in (("lr1", "Ayanda"), ("lr2", "Bongani"), ("lr3", "Kgosi")):
        t.put(f"/api/teacher/workspace/profiles/{pid}", json={"name": name, "classId": "c1", "language": "en"})
    return t.post("/api/teacher/join-codes", json={"class_id": "c1", "class_name": "Grade 4A"}).json()["code"]


def test_workspace_is_saved_per_teacher(settings):
    a, b = teacher(settings), teacher(settings, "b@example.org")
    assert a.put("/api/teacher/workspace/classes/c1", json={"name": "Grade 4A"}).json()["id"] == "c1"
    a.put("/api/teacher/workspace/lessons/l1", json={"title": "Fractions", "classId": "c1"})
    loaded = a.get("/api/teacher/workspace").json()
    assert [c["name"] for c in loaded["classes"]] == ["Grade 4A"] and loaded["lessons"][0]["title"] == "Fractions"
    assert b.get("/api/teacher/workspace").json() == {"classes": [], "profiles": [], "lessons": []}
    assert a.put("/api/teacher/workspace/secrets/x", json={}).status_code == 404
    assert a.put("/api/teacher/workspace/classes/bad id!", json={}).status_code == 422
    assert a.delete("/api/teacher/workspace/classes/c1").json() == {"deleted": True}
    assert a.get("/api/teacher/workspace").json()["classes"] == []


def test_picture_sign_in_for_young_learners(settings):
    t = teacher(settings)
    code = setup_class(t)
    guest = TestClient(create_app(settings))
    roster = guest.post("/api/auth/picture/roster", json={"code": code}).json()
    assert roster["class_name"] == "Grade 4A"
    assert [l["name"] for l in roster["learners"]] == ["Ayanda", "Bongani", "Kgosi"]
    assert not any(l["has_pictures"] for l in roster["learners"])

    pics = ["sun", "cat", "apple"]
    first = guest.post("/api/auth/picture/setup", json={"code": code, "learner_id": "lr2", "pictures": pics})
    assert first.status_code == 201 and first.json()["user"]["profile"]["fullName"] == "Bongani"
    learner = TestClient(create_app(settings))
    learner.headers["Authorization"] = f"Bearer {first.json()['access_token']}"
    link = learner.get("/api/learner/link").json()["link"]
    assert link["learner_profile_id"] == "lr2" and link["class_name"] == "Grade 4A"

    assert guest.post("/api/auth/picture/setup", json={"code": code, "learner_id": "lr2", "pictures": pics}).status_code == 409
    assert guest.post("/api/auth/picture/setup", json={"code": code, "learner_id": "lr2", "pictures": ["x", "y", "z"]}).status_code == 422
    assert guest.post("/api/auth/picture/login", json={"code": code, "learner_id": "lr2", "pictures": pics}).status_code == 200
    assert guest.post("/api/auth/picture/login", json={"code": code, "learner_id": "lr1", "pictures": pics}).status_code == 409
    assert guest.post("/api/auth/picture/login", json={"code": code, "learner_id": "ghost", "pictures": pics}).status_code == 404
    assert next(l for l in guest.post("/api/auth/picture/roster", json={"code": code}).json()["learners"]
                if l["id"] == "lr2")["has_pictures"]
    assert "lr2" in t.get("/api/teacher/roster").json()["picture_profiles"]

    wrong = ["tree", "tree", "tree"]
    codes = [guest.post("/api/auth/picture/login", json={"code": code, "learner_id": "lr2", "pictures": wrong}).status_code
             for _ in range(5)]
    assert codes == [401, 401, 401, 401, 423]
    assert guest.post("/api/auth/picture/login", json={"code": code, "learner_id": "lr2", "pictures": pics}).status_code == 423

    assert t.post("/api/teacher/workspace/profiles/lr2/reset-pictures").json() == {"reset": True}
    again = guest.post("/api/auth/picture/setup", json={"code": code, "learner_id": "lr2", "pictures": ["star", "car", "fish"]})
    assert again.status_code == 201 and again.json()["user"]["id"] == first.json()["user"]["id"]
    assert guest.post("/api/auth/picture/roster", json={"code": "ZZZZ-9999"}).status_code == 400


def test_password_reset(settings):
    s = dataclasses.replace(settings, show_reset_links=True)
    t = teacher(s)
    guest = TestClient(create_app(s))
    assert guest.post("/api/auth/forgot", json={"email": "nobody@example.org"}).json() == {"ok": True}
    link = guest.post("/api/auth/forgot", json={"email": "T@example.org"}).json()["dev_reset_link"]
    token = link.split("token=")[1]
    assert guest.post("/api/auth/reset", json={"token": token, "password": "brand-new-pass"}).json() == {"ok": True}
    assert t.get("/api/auth/me").status_code == 401
    assert guest.post("/api/auth/login", json={"email": "t@example.org", "password": "brand-new-pass"}).status_code == 200
    assert guest.post("/api/auth/reset", json={"token": token, "password": "another-pass-1"}).status_code == 400
    quiet = TestClient(create_app(settings))
    assert "dev_reset_link" not in quiet.post("/api/auth/forgot", json={"email": "t@example.org"}).json()


def test_learner_activity_progress_insights_and_evidence(settings):
    t = teacher(settings)
    code = setup_class(t)
    run_id = t.post("/api/runs", json=DEMO).json()["run_id"]
    wait(t, run_id)
    t.post(f"/api/runs/{run_id}/approve")
    guest = TestClient(create_app(settings))
    session = guest.post("/api/auth/picture/setup", json={"code": code, "learner_id": "lr2", "pictures": ["sun", "cat", "apple"]})
    learner = TestClient(create_app(settings))
    learner.headers["Authorization"] = f"Bearer {session.json()['access_token']}"

    post = lambda kind, data: learner.post("/api/learner/activity", json={"run_id": run_id, "kind": kind, "data": data})
    assert post("opened", {"topic": "Fractions"}).status_code == 201
    assert post("opened", {"topic": "Fractions"}).status_code == 201
    post("answer", {"question": 0, "correct": False, "attempt": 1, "topic": "Fractions"})
    post("answer", {"question": 0, "correct": True, "attempt": 2, "topic": "Fractions"})
    post("answer", {"question": 1, "correct": True, "attempt": 1, "topic": "Fractions"})
    post("answer", {"question": 0, "prompt": "Which shows a half?", "correct": False, "attempt": 1, "topic": "Fractions"})
    post("practice_done", {"score": 1, "total": 2, "topic": "Fractions"})
    post("reflection", {"feeling": "Difficult", "helped": ["Pictures"], "topic": "Fractions"})
    assert post("cheating", {}).status_code == 422
    assert learner.post("/api/learner/activity", json={"run_id": "nope", "kind": "opened"}).status_code == 404
    learner.post("/api/learner/explain", json={"run_id": run_id, "style": "visual"})

    progress = learner.get("/api/learner/progress").json()
    assert progress["lessons_opened"] == 1 and progress["practice_done"] == 1
    assert progress["first_try_correct"] == 1 and progress["questions_tried"] == 3
    assert progress["recent"]["topic"] == "Fractions"

    insights = t.get("/api/teacher/insights", params={"class_id": "c1"}).json()
    lesson = insights["lessons"][run_id]
    assert lesson["opened"] == 1 and lesson["practised"] == 1
    assert lesson["questions"] == {"0": {"first_try": 0, "missed": 1}, "1": {"first_try": 1, "missed": 0},
                                   "Which shows a half?": {"first_try": 0, "missed": 1}}
    assert lesson["feelings"] == {"Difficult": 1} and lesson["explain_styles"] == {"visual": 1}
    assert insights["learners"]["lr2"]["missed"] == 2
    other = teacher(settings, "o@example.org")
    assert other.get("/api/teacher/insights", params={"class_id": "c1"}).json() == {"lessons": {}, "learners": {}}

    nxt = wait(t, t.post("/api/runs", json=DEMO).json()["run_id"])
    recalled = next(e for e in t.get(f"/api/runs/{nxt['id']}?events=true").json()["events"]
                    if e["agent"] == "Progress Tracker" and e["type"] == "agent_output")
    assert "practice evidence for 1 learner" in recalled["title"]
    evidence = [m for m in nxt["result"]["pack"]["memory_applied"] if m["outcome"] == "Evidence"]
    assert evidence and evidence[0]["learner_id"] == "lr2"
    assert "answered 1 of 3" in evidence[0]["note"].lower() and "visual explanation" in evidence[0]["note"]


def _docx(paragraphs):
    import io, zipfile
    body = "".join(f'<w:p><w:r><w:t>{p}</w:t></w:r></w:p>' for p in paragraphs)
    xml = ('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
           f"<w:body>{body}</w:body></w:document>")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", xml)
    return buf.getvalue()


def test_document_text_reads_supported_files():
    from tools.document_text import UnreadableDocument, extract_text
    assert extract_text("plan.txt", b"Halves   and\n\n\n\nquarters") == "Halves and\n\nquarters"
    assert extract_text("Plan.DOCX", _docx(["Fractions", "Share a roti"])) == "Fractions\nShare a roti"
    for name, data in (("x.docx", b"not a zip"), ("x.pdf", b"%PDF-broken"), ("x.pptx", b"")):
        with pytest.raises(UnreadableDocument):
            extract_text(name, data)


def test_resources_are_stored_and_read_per_teacher(settings):
    import base64
    a, b = teacher(settings), teacher(settings, "b@example.org")
    up = lambda client, name, data, **kw: client.post("/api/teacher/resources", json={
        "title": "Term 4 fractions", "grade": "Grade 4", "subject": "Mathematics", "type": "Lesson plan",
        "filename": name, "content_base64": base64.b64encode(data).decode(), **kw})

    word = up(a, "C:\\docs\\plan.docx", _docx(["Fold paper into halves.", "Then quarters."]))
    assert word.status_code == 201
    doc = word.json()
    assert doc["filename"] == "plan.docx" and doc["text_chars"] > 10 and doc["note"] is None
    assert doc["mime"].endswith("wordprocessingml.document")
    picture = up(a, "chart.png", b"\x89PNG fake").json()
    assert picture["text_chars"] == 0 and "only read" in picture["note"]
    assert up(a, "evil.html", b"<script>").status_code == 422
    assert up(a, "plan.txt", b"x", content_base64="@@@").status_code == 422

    assert [r["id"] for r in a.get("/api/teacher/resources").json()["resources"]] == [picture["id"], doc["id"]]
    assert "Fold paper" in a.get(f"/api/teacher/resources/{doc['id']}/text").json()["text"]
    file = a.get(f"/api/teacher/resources/{doc['id']}/file")
    assert file.status_code == 200 and file.content.startswith(b"PK") and "plan.docx" in file.headers["content-disposition"]

    assert b.get("/api/teacher/resources").json() == {"resources": []}
    assert b.get(f"/api/teacher/resources/{doc['id']}/text").status_code == 404
    assert b.get(f"/api/teacher/resources/{doc['id']}/file").status_code == 404
    assert b.delete(f"/api/teacher/resources/{doc['id']}").json() == {"deleted": False}
    assert a.delete(f"/api/teacher/resources/{doc['id']}").json() == {"deleted": True}
    assert len(a.get("/api/teacher/resources").json()["resources"]) == 1
