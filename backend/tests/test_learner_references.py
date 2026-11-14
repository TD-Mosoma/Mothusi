"""Models sometimes refer to a learner by name, or copy an id with a small slip. A learner must not lose their
support over that, but Mothusi only accepts a reference that fits exactly one learner."""

from agents.base import resolve_learner
from models.schemas import WHOLE_CLASS, LearnerProfile

LEARNERS = [
    LearnerProfile(id="lrlerato", code="L-001", name="Lerato Mokoena", support="Pictures"),
    LearnerProfile(id="lrthabo", code="L-003", name="Thabo Molefe", support="Think time"),
    LearnerProfile(id="lrpieter", code="L-007", name="Pieter van Wyk", support="Oral answers"),
    LearnerProfile(id="lrmhq3x2k4a1", code="L-009", name="Naledi Maseko", support="Recap"),
]


def test_exact_ids_names_codes_and_first_names():
    assert resolve_learner("lrthabo", LEARNERS) == "lrthabo"
    assert resolve_learner("Thabo Molefe", LEARNERS) == "lrthabo"
    assert resolve_learner("  thabo ", LEARNERS) == "lrthabo"
    assert resolve_learner("L-007", LEARNERS) == "lrpieter"
    assert resolve_learner("whole class", LEARNERS) == WHOLE_CLASS


def test_small_slips_in_ids_are_recovered():
    # These are the exact slips a live model made while planning for this class.
    assert resolve_learner("lthabo", LEARNERS) == "lrthabo"
    assert resolve_learner("lpieter", LEARNERS) == "lrpieter"
    assert resolve_learner("lrlaterato", LEARNERS) == "lrlerato"
    assert resolve_learner("lrmhq3x2k4a", LEARNERS) == "lrmhq3x2k4a1"


def test_unknown_or_ambiguous_references_are_not_guessed():
    assert resolve_learner("lr99", LEARNERS) is None
    assert resolve_learner("Sipho", LEARNERS) is None
    twins = [LearnerProfile(id="lrab1", name="Thabo A", support="x"), LearnerProfile(id="lrab2", name="Thabo B", support="x")]
    assert resolve_learner("thabo", twins) is None  # two Thabos: the first name alone is not enough
    assert resolve_learner("lrab", twins) is None    # equally close to both ids
