from orchestration.events import RunTrace
from tests.conftest import ScriptedLLM, events_of


def run(orchestrator, request, llm):
    trace = RunTrace("g")
    return trace, orchestrator.plan_lesson(trace, llm, request)


def nodes_visited(trace):
    seen = []
    for e in trace.events:
        if e.node and (not seen or seen[-1] != e.node):
            seen.append(e.node)
    return seen


def test_graph_path_and_node_tagging(orchestrator, demo_request, mock_llm):
    trace, _ = run(orchestrator, demo_request, mock_llm)
    path = nodes_visited(trace)
    assert path == ["screen", "recall", "plan", "analyse", "match", "design", "review", "route", "design", "review",
                    "personalise", "translate", "pack"]
    assert trace.node is None


def test_designer_uses_check_plan_tool_when_revising(orchestrator, demo_request, mock_llm):
    trace, _ = run(orchestrator, demo_request, mock_llm)
    tool = [e for e in events_of(trace, "tool") if e.agent == "Adaptation Designer" and e.data["tool"] == "check_plan"]
    assert tool and tool[0].data["problems"] == []


def test_check_plan_reports_problems_back_to_the_designer(orchestrator, demo_request):
    def design(ctx):
        base = ScriptedLLM()._adaptation_designer({**ctx, "mode": "design"})
        if ctx.get("turn", 0) == 0:
            return {**base, "action": "check"}
        fixed = [dict(a, teacher_minutes=0) for a in base["adaptations"]]
        return {"action": "submit", "adaptations": fixed}
    trace, result = run(orchestrator, demo_request, ScriptedLLM(adaptation_designer=[design]))
    tool = next(e for e in events_of(trace, "tool") if e.agent == "Adaptation Designer" and e.data["tool"] == "check_plan")
    assert any("20 min" in p for p in tool.data["problems"])
    assert not events_of(trace, "check_failed")
    assert result["pack"]["stats"]["corrections"] == 0


def test_planner_guardrail_keeps_translation_learners(orchestrator, demo_request):
    plan = {"summary": "Focus on Learner A only.", "personalise_for": ["lr1", "ghost"], "priorities": []}
    trace, result = run(orchestrator, demo_request, ScriptedLLM(planner=[plan]))
    guardrails = [e.detail for e in events_of(trace, "decision") if e.title == "Guardrail applied to the plan"]
    assert any("Learner C learns in Setswana" in g for g in guardrails)
    assert any("not in this class" in g for g in guardrails)
    assert any("Learner B will use the whole-class material" in e.title for e in events_of(trace, "decision"))
    learners = {l["id"]: l for l in result["pack"]["learners"]}
    assert learners["lr2"]["material"] is None and learners["lr3"]["material"]


def test_router_can_send_work_back_to_the_analyst_once(orchestrator, demo_request):
    route = {"route": "analyst", "reason": "The flow leaves no time for support.", "guidance": "Shorter modelling."}
    llm = ScriptedLLM(router=[route])
    trace, _ = run(orchestrator, demo_request, llm)
    path = nodes_visited(trace)
    assert path[path.index("route") + 1] == "analyse"
    assert llm.calls.count("lesson_analyst") == 2
    assert any(e.title == "Sending the lesson back to the Lesson Analyst" for e in events_of(trace, "decision"))


def test_guardrail_blocks_early_escalation(orchestrator, demo_request):
    llm = ScriptedLLM(router=[{"route": "teacher", "reason": "Too hard."}])
    trace, result = run(orchestrator, demo_request, llm)
    assert any("tries one revision before escalating" in e.title for e in events_of(trace, "decision"))
    assert result["pack"]["stats"]["corrections"] == 1 and not result["unresolved"]


def test_planner_and_router_fail_safe(orchestrator, demo_request):
    llm = ScriptedLLM(planner=["not json"], router=["not json"])
    trace, result = run(orchestrator, demo_request, llm)
    titles = [e.title for e in events_of(trace, "warning")]
    assert "Planner unavailable; using the default plan" in titles
    assert any(t.startswith("Router unavailable") for t in titles)
    assert result["pack"]["stats"]["corrections"] == 1


def test_graph_structure_is_served(settings):
    from fastapi.testclient import TestClient
    from api.routes import create_app
    body = TestClient(create_app(settings)).get("/api/graph").json()
    ids = {n["id"] for n in body["nodes"]}
    assert {"plan", "design", "review", "route", "translate"} <= ids
    labels = {(e["source"], e["target"]): e["label"] for e in body["edges"]}
    assert labels[("review", "route")] == "rejected" and labels[("route", "design")] == "revise"


def test_designer_text_uses_learner_labels_not_ids(orchestrator, demo_request):
    def design(ctx):
        out = ScriptedLLM()._adaptation_designer({**ctx, "mode": "design"})
        for a in out["adaptations"]:
            a["instruction"] = f"Ask {a['learner_id']} to show the answer on the board."
            a["teacher_minutes"] = 0
        return out
    _, result = run(orchestrator, demo_request, ScriptedLLM(adaptation_designer=[design]))
    texts = " ".join(a["instruction"] for a in result["state"]["adaptations"])
    assert "lr1" not in texts and "Ask Learner A to show" in texts


def test_learner_labels_in_the_id_field_are_mapped_back(orchestrator, demo_request):
    names = {"lr1": "Learner A", "lr2": "Learner B", "lr3": "Learner C"}

    def design(ctx):
        out = ScriptedLLM()._adaptation_designer({**ctx, "mode": "design"})
        for a in out["adaptations"]:
            a["learner_id"] = names.get(a["learner_id"], a["learner_id"])
            a["teacher_minutes"] = 0
        return out
    trace, result = run(orchestrator, demo_request, ScriptedLLM(adaptation_designer=[design]))
    assert not events_of(trace, "check_failed")
    assert {a["learner_id"] for a in result["state"]["adaptations"]} >= {"lr1", "lr2", "lr3"}
