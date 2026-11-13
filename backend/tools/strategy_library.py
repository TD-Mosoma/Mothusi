"""A small library of vetted, low-cost classroom strategies for Grades 1–4.

The Adaptation Designer is shown the strategies that fit the learners and the day's conditions, so its suggestions
start from proven practice instead of a blank page. Costs are typical estimates for a class of about 40.
"""

from dataclasses import dataclass

from models.schemas import LessonRequest


@dataclass(frozen=True)
class Strategy:
    title: str
    supports: frozenset[str]
    how: str
    teacher_minutes: int
    prep_minutes: int
    needs_print: bool = False
    needs_speech: bool = False
    needs_devices: bool = False

    def as_prompt(self) -> str:
        return f"{self.title} ({self.teacher_minutes} min one-to-one, {self.prep_minutes} min prep): {self.how}"


S = Strategy
LIBRARY: list[Strategy] = [
    S("Board sketch to copy and label", frozenset({"visual"}),
      "draw one clear labelled sketch of the idea on the board; the learner copies and labels it in their book", 1, 5),
    S("Picture cards from scrap paper", frozenset({"visual", "reading"}),
      "the learner makes 2–3 small picture cards of the key examples and uses them to check answers", 0, 5),
    S("Colour-coded examples", frozenset({"visual"}),
      "use one chalk colour for the whole and another for the parts in every board example", 0, 2),
    S("Numbered checklist on the board", frozenset({"steps", "attention"}),
      "write 3 short numbered steps on the board; the learner ticks each one off in their book", 1, 3),
    S("Step strip on the desk", frozenset({"steps", "attention"}),
      "a paper strip with 3 picture-steps; the learner folds back each step when it is done", 0, 10),
    S("One instruction at a time", frozenset({"steps"}),
      "give the next instruction only when the learner shows the previous step is finished", 2, 0, needs_speech=True),
    S("Real objects to share", frozenset({"practical"}),
      "the learner shares bottle tops, stones or paper circles into equal groups before writing anything", 1, 5),
    S("Fold and tear paper", frozenset({"practical", "visual"}),
      "the learner folds and tears scrap paper into equal parts with a buddy to show each example", 0, 2),
    S("Movement break with a task", frozenset({"attention", "practical"}),
      "the learner collects or hands out the class materials as a short, purposeful movement break", 0, 0),
    S("Bilingual word wall", frozenset({"language", "reading"}),
      "write 3–5 key words on the board with their meaning in the learners' chosen languages", 0, 10),
    S("Home-language buddy", frozenset({"language"}),
      "pair the learner with a buddy who shares their chosen language to explain the task to each other",
      0, 1, needs_speech=True),
    S("Picture prompts instead of text", frozenset({"reading", "visual"}),
      "replace written task instructions with simple drawings on the board", 0, 8),
    S("Fewer items, same difficulty", frozenset({"attention", "reading", "steps"}),
      "the learner does the first 3 questions only, at the same level as the class, then checks with a buddy", 0, 0),
    S("Printed task cards", frozenset({"steps", "reading"}),
      "one printed card per step for the learner to work through in order", 1, 15, needs_print=True),
    S("Buddy check", frozenset({"general"}),
      "pair the learner with a buddy who checks each answer with them against the board example", 0, 0),
]

_KEYWORDS = {
    "visual": ("visual", "diagram", "picture", "draw", "see", "colour", "color"),
    "steps": ("short", "step", "structured", "sequenc", "routine", "one at a time", "instruction"),
    "practical": ("practical", "hands", "concrete", "object", "real", "touch", "manipul"),
    "attention": ("focus", "attention", "movement", "break", "short tasks", "move"),
    "reading": ("read", "words", "text", "vocabulary"),
}


def support_categories(text: str) -> set[str]:
    low = (text or "").lower()
    return {cat for cat, words in _KEYWORDS.items() if any(w in low for w in words)}


def relevant_strategies(req: LessonRequest, limit: int = 10) -> list[Strategy]:
    """Strategies that match the learners' stated supports and are possible under today's conditions."""
    wanted: set[str] = {"general"}
    for learner in req.learners:
        wanted |= support_categories(f"{learner.support} {learner.strengths}")
        if learner.language != "en":
            wanted.add("language")
    c = req.constraints
    usable = [s for s in LIBRARY
              if s.supports & wanted
              and (c.has_printer or not s.needs_print)
              and (c.has_devices or not s.needs_devices)
              and not (c.noisy_venue and s.needs_speech)
              and s.prep_minutes <= c.prep_minutes]
    usable.sort(key=lambda s: s.teacher_minutes + s.prep_minutes)
    picked: list[Strategy] = []
    # Cover every support this class needs before adding more of the same kind.
    for cat in sorted(wanted - {"general"}) + ["general"]:
        for s in [s for s in usable if cat in s.supports and s not in picked][:2]:
            picked.append(s)
    picked += [s for s in usable if s not in picked]
    return picked[:limit]
