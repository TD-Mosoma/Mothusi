import re
import time

from llm.client import LLMError
from llm.mock import MockClient
from models.schemas import ClassroomConstraints, FeedbackRequest, LessonRequest, ReplanRequest
from orchestration import runs as runs_module
from orchestration.events import RunTrace
from orchestration.runs import RunManager
from tests.conftest import DEMO, ScriptedLLM, events_of


def run_plan(orchestrator, request, llm=None, trace=None):
    trace = trace or RunTrace("t")
    result = orchestrator.plan_lesson(trace, llm or MockClient(delay_seconds=0), request)
    return trace, result


def stored(store, run_id, request, result, kind="plan"):
    store.create_run(run_id=run_id, kind=kind, title="t", request=request.model_dump(), model="mock")
    store.finish_run(run_id, "completed", result=result)
    return store.get_run(run_id)


def test_reviewer_rejects_and_designer_corrects(orchestrator, demo_request):
    trace, result = run_plan(orchestrator, demo_request)
    failed = events_of(trace, "check_failed")
    assert failed and "20 min" in failed[0].detail
    assert any("Sending 1 item(s) back" in e.title for e in events_of(trace, "decision"))
    ads = result["state"]["adaptations"]
    assert sum(a["teacher_minutes"] for a in ads) <= 5
    revised = next(a for a in ads if a["learner_id"] == "lr1")
    assert revised["id"] == "a1" and revised["revision"] == 2
    assert result["pack"]["stats"]["corrections"] == 1
    assert all(c["passed"] for c in result["pack"]["checks"])


def test_plan_event_lists_dynamic_steps(orchestrator, demo_request):
    trace, _ = run_plan(orchestrator, demo_request)
    plan = events_of(trace, "plan")[0]
    agents = [s["agent"] for s in plan.data["steps"]]
    assert agents[0] == "Lesson Analyst" and agents[-1] == "Pack Builder"
    assert plan.data["design_guidance"] and plan.data["priorities"]
    assert "Setswana" in plan.detail
    english_only = demo_request.model_copy(update={"learners": [l.model_copy(update={"language": "en"}) for l in demo_request.learners]})
    trace, _ = run_plan(orchestrator, english_only)
    assert "Skipped: every learner's selected language is English" in events_of(trace, "plan")[0].detail


def test_offline_mode_is_honest_about_translation(orchestrator, demo_request):
    _, result = run_plan(orchestrator, demo_request)
    c = next(l for l in result["pack"]["learners"] if l["id"] == "lr3")
    assert c["translation"]["status"] == "unavailable"
    assert any("not ready" in w for w in result["warnings"])


def test_replan_for_noisy_hall_changes_only_affected_items(orchestrator, store, demo_request):
    _, first = run_plan(orchestrator, demo_request)
    parent = stored(store, "p1", demo_request, first)
    noisy = demo_request.constraints.model_copy(update={"noisy_venue": True})
    trace = RunTrace("r")
    result = orchestrator.replan(trace, MockClient(delay_seconds=0), parent, ReplanRequest(constraints=noisy))
    assert any(e.data and e.data.get("check") == "noise" for e in events_of(trace, "check_failed"))
    changed = {c["learner_id"] for c in result["changes"]}
    assert changed == {"lr2"}
    b = next(a for a in result["state"]["adaptations"] if a["learner_id"] == "lr2")
    assert "aloud" not in b["instruction"]
    refresh = next(e for e in events_of(trace, "decision") if e.title.startswith("Refreshing learner material"))
    assert "1 of 4" in refresh.title
    assert any(c["check"] == "noise" and c["passed"] for c in result["pack"]["checks"])
    assert any("Setswana material is not ready" in w for w in result["warnings"])


def test_feedback_changes_the_next_plan(orchestrator, store, demo_request):
    _, first = run_plan(orchestrator, demo_request)
    stored(store, "p1", demo_request, first)
    b = next(a for a in first["state"]["adaptations"] if a["learner_id"] == "lr2")
    fb = FeedbackRequest(run_id="p1", overall="Partly worked", outcomes=[{
        "adaptation_id": b["id"], "learner_id": "lr2", "learner_label": "Learner B", "strategy": b["strategy"],
        "instruction": b["instruction"], "outcome": "Did not work"}])
    trace = RunTrace("f")
    summary = orchestrator.record_feedback(trace, fb, store.get_run("p1"))
    assert summary["avoid"] == [b["strategy"]]

    trace, second = run_plan(orchestrator, demo_request)
    recalled = next(e for e in trace.events if e.agent == "Progress Tracker" and e.type == "agent_output")
    assert "1 did not work" in recalled.title
    new_b = next(a for a in second["state"]["adaptations"] if a["learner_id"] == "lr2")
    assert new_b["strategy"] != b["strategy"]
    assert any(c["check"] == "memory" and c["passed"] for c in second["pack"]["checks"])


def test_memory_check_rejects_a_repeat(orchestrator, store, demo_request):
    store.add_feedback([{"lesson_id": None, "run_id": None, "grade": "Grade 4", "subject": "Mathematics",
                         "topic": "Fractions", "learner_id": "lr3", "learner_label": "Learner C", "adaptation_id": "a3",
                         "strategy": "Share real objects", "instruction": "Learner C shares bottle tops or paper circles "
                         "equally between groups to show fractions before writing anything.",
                         "outcome": "Did not work", "note": ""}])
    stubborn = ScriptedLLM()
    original = stubborn._adaptation_designer

    def design(ctx):
        out = original({**ctx, "memory": []}) if ctx["mode"] == "design" else original(ctx)
        return out
    stubborn.scripts["adaptation_designer"] = [design]
    trace, result = run_plan(orchestrator, demo_request, stubborn)
    assert any(e.data and e.data.get("check") == "memory" for e in events_of(trace, "check_failed"))
    c = next(a for a in result["state"]["adaptations"] if a["learner_id"] == "lr3")
    assert c["strategy"] != "Share real objects"


def test_stops_after_max_attempts_and_flags_instead_of_hiding(orchestrator, demo_request):
    def design(ctx):
        if ctx["mode"] == "design":
            return {"adaptations": [
                {"learner_id": l["id"], "strategy": f"One-to-one help {i}", "instruction": "Sit with the learner for a long re-teach.",
                 "teacher_minutes": 20 if i == 0 else 0} for i, l in enumerate(ctx["request"]["learners"])]}
        return {"adaptations": [{"learner_id": "lr1", "replaces": "a1", "strategy": "Still long help",
                                 "instruction": "Sit with the learner for a slightly shorter re-teach.", "teacher_minutes": 15}]}
    trace, result = run_plan(orchestrator, demo_request, ScriptedLLM(adaptation_designer=[design]))
    assert result["pack"]["stats"]["design_attempts"] == 3
    assert "a1" in result["unresolved"]
    assert any("20 min" in w or "15 min" in w for w in result["warnings"])
    assert any("Stopped after 3 design attempts" in e.title for e in events_of(trace, "warning"))


def test_invalid_output_is_repaired(orchestrator, demo_request):
    llm = ScriptedLLM()
    llm.scripts["lesson_analyst"] = ["I think the lesson is about fractions.", llm._lesson_analyst]
    trace, result = run_plan(orchestrator, demo_request, llm)
    assert len(events_of(trace, "repair")) == 1
    assert result["state"]["analysis"]["demands"]


def test_language_agent_rejects_lost_numbers_then_accepts(orchestrator, demo_request):
    def first(ctx):
        return {"translations": [re.sub(r"\d", "", line) for line in ctx["lines"]]}

    def second(ctx):
        return {"translations": [f"(tn) {line}" for line in ctx["lines"]]}
    llm = ScriptedLLM(translator=[first, second],
                      translation_checker=[{"meaning_preserved": True, "issues": [], "back_translation": "ok"}])
    trace, result = run_plan(orchestrator, demo_request, llm)
    assert any("lost the number" in e.detail for e in events_of(trace, "check_failed"))
    c = next(l for l in result["pack"]["learners"] if l["id"] == "lr3")
    assert c["translation"]["status"] == "checked"
    assert c["translation"]["material"]["explanation"][0].startswith("(tn)")


def test_diagnostic_labels_never_reach_agents(orchestrator, demo_request):
    learners = [demo_request.learners[0].model_copy(update={"support": "Has ADHD; short instructions help"})]
    req = demo_request.model_copy(update={"learners": learners})
    llm = ScriptedLLM()
    seen = []
    original = llm._needs_matcher
    llm.scripts["needs_matcher"] = [lambda ctx: seen.append(ctx) or original(ctx)]
    trace, _ = run_plan(orchestrator, req, llm)
    assert any("Removed diagnostic labels" in e.title for e in events_of(trace, "warning"))
    assert "adhd" not in str(seen).lower()


def test_run_manager_fails_safely_when_model_is_down(settings, store, monkeypatch, demo_request):
    class Down(MockClient):
        def complete(self, *a, **k):
            raise LLMError("The language model is not responding (APITimeoutError).")
    monkeypatch.setattr(runs_module, "build_client", lambda s, offline=False: Down(delay_seconds=0))
    from orchestration.workflow import Orchestrator
    orch = Orchestrator(settings, store)
    manager = RunManager(settings, store)
    run_id = manager.start(kind="plan", title="t", request=demo_request.model_dump(),
                           job=lambda trace, llm: orch.plan_lesson(trace, llm, demo_request))
    for _ in range(100):
        if manager.traces[run_id].done:
            break
        time.sleep(0.02)
    run = store.get_run(run_id)
    assert run["status"] == "failed" and "not responding" in run["error"]
    assert manager.traces[run_id].events[-1].type == "run_failed"


def test_whole_class_only_plan(orchestrator):
    req = LessonRequest.model_validate({**DEMO, "learners": [], "grade": "Grade 2", "topic": "Sharing equally",
                                        "constraints": ClassroomConstraints(class_size=30, lesson_minutes=30,
                                                                            support_minutes=0).model_dump()})
    trace, result = run_plan(orchestrator, req)
    assert not any(e.agent == "Needs Matcher" for e in trace.events if e.type == "agent_started")
    assert result["pack"]["whole_class"]["material"]


def test_revisions_only_replace_rejected_work():
    from models.schemas import Adaptation, DraftAdaptation
    from orchestration.workflow import _merge_revisions
    base = dict(phase="", instruction="Do something useful in class.", teacher_minutes=0, materials=[], addresses="")
    current = [Adaptation(id="a1", learner_id="lr1", strategy="Long re-teach", **base),
               Adaptation(id="a2", learner_id="whole_class", strategy="Board examples", **base)]
    rejected = [(current[0], "lr1", ["too long"]), (None, "lr2", ["missing"])]
    drafts = [DraftAdaptation(learner_id="lr1", strategy="Picture cards", replaces="a1", **base),
              DraftAdaptation(learner_id="whole_class", strategy="Board examples", **base),
              DraftAdaptation(learner_id="lr2", strategy="Step strip", **base),
              DraftAdaptation(learner_id="lr2", strategy="Second extra", **base)]
    merged = _merge_revisions(current, rejected, drafts)
    assert [(a.id, a.strategy) for a in merged] == [("a1", "Picture cards"), ("a2", "Board examples"), ("a3", "Step strip")]
    assert merged[0].revision == 2
