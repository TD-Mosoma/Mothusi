from models.schemas import Adaptation, ClassroomConstraints, FlowPhase, LessonRequest
from tools.safety_tools import find_labels, redact_labels
from tools.validation_tools import check_adaptations, find_terms, rebalance_flow


def make(**kw):
    base = dict(id="a1", learner_id="lr1", strategy="Strategy", instruction="Do something useful in class.",
                teacher_minutes=0, materials=[])
    return Adaptation(**{**base, **kw})


def request_with(demo_request, **constraints):
    c = demo_request.constraints.model_copy(update=constraints)
    return demo_request.model_copy(update={"constraints": c})


def by_check(issues, check):
    return [i for i in issues if i.check == check]


def test_single_activity_over_budget_is_rejected(demo_request):
    ads = [make(id="a1", teacher_minutes=20), make(id="a2", learner_id="lr2"), make(id="a3", learner_id="lr3")]
    issues, checks = check_adaptations(ads, demo_request)
    assert [i.adaptation_id for i in by_check(issues, "teacher_time")] == ["a1"]
    assert not next(c for c in checks if c.check == "teacher_time").passed


def test_total_budget_flags_only_what_is_needed(demo_request):
    ads = [make(id="a1", teacher_minutes=4), make(id="a2", learner_id="lr2", teacher_minutes=3),
           make(id="a3", learner_id="lr3", teacher_minutes=2)]
    issues, _ = check_adaptations(ads, demo_request)
    assert [i.adaptation_id for i in by_check(issues, "teacher_time")] == ["a1"]


def test_negated_printing_is_allowed(demo_request):
    ads = [make(instruction="Draw on the board instead of printed worksheets."),
           make(id="a2", learner_id="lr2", instruction="Hand out a printed worksheet to each pair."),
           make(id="a3", learner_id="lr3")]
    issues, _ = check_adaptations(ads, demo_request)
    assert [i.adaptation_id for i in by_check(issues, "printer")] == ["a2"]


def test_noise_only_checked_in_noisy_venue(demo_request):
    ads = [make(instruction="Read each step aloud once and wait."), make(id="a2", learner_id="lr2"),
           make(id="a3", learner_id="lr3")]
    assert not by_check(check_adaptations(ads, demo_request)[0], "noise")
    noisy = request_with(demo_request, noisy_venue=True)
    assert by_check(check_adaptations(ads, noisy)[0], "noise")


def test_missing_learner_and_labels(demo_request):
    ads = [make(instruction="Seat the ADHD learner near the front of the class.")]
    issues, _ = check_adaptations(ads, demo_request)
    assert by_check(issues, "labels")
    assert {i.learner_id for i in by_check(issues, "coverage")} == {"lr2", "lr3"}


def test_memory_blocks_strategy_that_did_not_work(demo_request):
    ads = [make(strategy="Numbered steps on the board", instruction="Write three numbered steps on the board."),
           make(id="a2", learner_id="lr2"), make(id="a3", learner_id="lr3")]
    memory = [{"learner_id": "lr1", "outcome": "Did not work", "strategy": "Numbered steps on the board",
               "instruction": "Write three numbered steps on the board and read each step aloud once.", "topic": "Fractions"}]
    issues, checks = check_adaptations(ads, demo_request, memory)
    assert [i.adaptation_id for i in by_check(issues, "memory")] == ["a1"]
    assert any(c.check == "memory" for c in checks)


def test_term_matching_is_whole_word():
    assert find_terms("Use an apple to show halves", ["app"]) == []
    assert find_terms("Learners sing a counting song", ["sing"]) == ["sing"]
    assert find_terms("A single paper strip", ["sing"]) == []


def test_labels_are_redacted():
    text = "Has dyslexia, likes drawing"
    assert find_labels(text) == ["dyslexia"]
    assert "dyslexia" not in redact_labels(text)


def test_flow_rebalanced_to_lesson_length():
    flow = [FlowPhase(label="Intro", minutes=10), FlowPhase(label="Main", minutes=30), FlowPhase(label="Exit", minutes=10)]
    fixed, changed = rebalance_flow(flow, 45)
    assert changed and sum(p.minutes for p in fixed) == 45
    same, changed = rebalance_flow(fixed, 45)
    assert not changed and same == fixed


def test_request_scope_is_grades_one_to_four(demo_request):
    data = demo_request.model_dump()
    import pytest
    with pytest.raises(ValueError):
        LessonRequest.model_validate({**data, "grade": "Grade 7"})
    with pytest.raises(ValueError):
        LessonRequest.model_validate({**data, "grade": "Grade 2", "subject": "Natural Sciences and Technology"})
    assert ClassroomConstraints(class_size=30, lesson_minutes=30, support_minutes=0).support_minutes == 0


def test_preparation_budget_is_enforced(demo_request):
    tight = request_with(demo_request, prep_minutes=15)
    ads = [make(id="a1", prep_minutes=40), make(id="a2", learner_id="lr2", prep_minutes=10),
           make(id="a3", learner_id="lr3", prep_minutes=10)]
    issues, checks = check_adaptations(ads, tight)
    flagged = [i.adaptation_id for i in by_check(issues, "prep_time")]
    assert flagged[0] == "a1" and len(flagged) == 2
    assert not next(c for c in checks if c.check == "prep_time").passed
    fine, _ = check_adaptations([make(prep_minutes=5), make(id="a2", learner_id="lr2"), make(id="a3", learner_id="lr3")], tight)
    assert not by_check(fine, "prep_time")


def test_more_diagnostic_labels_and_decimals():
    from tools.text_tools import numbers_in
    assert find_labels("He has dysgraphia and OCD") == ["dysgraphia", "ocd"]
    assert numbers_in("Share 0.5 of the bread, or 1/4, or 2,5") == ["0.5", "1/4", "2,5"]


def test_strategy_library_respects_conditions(demo_request):
    from tools.strategy_library import relevant_strategies
    titles = [s.title for s in relevant_strategies(demo_request)]
    assert "Printed task cards" not in titles and "Bilingual word wall" in titles
    noisy = request_with(demo_request, noisy_venue=True, prep_minutes=4)
    for s in relevant_strategies(noisy):
        assert not s.needs_speech and s.prep_minutes <= 4
