"""Offline demo model. Rule-based and clearly labelled in the UI; used for rehearsals, tests and as a fallback.

It deliberately makes one realistic first-draft mistake (a 20-minute one-to-one activity) so the Reviewer's
self-correction can be demonstrated without a network connection.
"""

import json
import random
import time

from llm.client import Completion, LLMError
from models.schemas import WHOLE_CLASS, language_name
from tools.text_tools import similarity


def _category(support: str) -> str:
    s = support.lower()
    if any(w in s for w in ("visual", "diagram", "picture", "draw", "see")):
        return "visual"
    if any(w in s for w in ("short", "step", "structured", "sequenc", "routine", "one at a time")):
        return "steps"
    if any(w in s for w in ("practical", "hands", "concrete", "object", "real", "touch", "movement")):
        return "practical"
    return "general"


def _options(category: str, name: str, topic: str) -> list[dict]:
    t = topic.lower()
    return {
        "visual": [
            {"strategy": "Draw-and-shade pictures", "teacher_minutes": 2, "prep_minutes": 5, "materials": ["chalkboard", "exercise book"],
             "instruction": f"Draw each {t} example on the board as a labelled picture. {name} copies it and shades the parts before answering."},
            {"strategy": "Picture cards from scrap paper", "teacher_minutes": 0, "prep_minutes": 5, "materials": ["scrap paper", "crayons"],
             "instruction": f"{name} makes three picture cards that show the {t} examples and uses them to check each answer."},
        ],
        "steps": [
            {"strategy": "Numbered steps on the board", "teacher_minutes": 1, "prep_minutes": 3, "materials": ["chalkboard"],
             "instruction": f"Write three numbered steps on the board and read each step aloud once. {name} ticks each step in their book when done."},
            {"strategy": "Step strip on the desk", "teacher_minutes": 0, "prep_minutes": 10, "materials": ["paper strip", "pencil"],
             "instruction": f"Give {name} a paper strip with three numbered picture-steps. {name} folds back each step when it is done."},
        ],
        "practical": [
            {"strategy": "Share real objects", "teacher_minutes": 2, "prep_minutes": 5, "materials": ["bottle tops", "paper circles"],
             "instruction": f"{name} shares bottle tops or paper circles equally between groups to show {t} before writing anything."},
            {"strategy": "Fold and tear paper", "teacher_minutes": 0, "prep_minutes": 2, "materials": ["scrap paper"],
             "instruction": f"{name} folds and tears scrap paper into equal parts with a buddy to show each {t} example."},
        ],
        "general": [
            {"strategy": "Buddy check", "teacher_minutes": 0, "materials": [],
             "instruction": f"Pair {name} with a buddy who checks each answer with them and points to the board example."},
            {"strategy": "Worked example first", "teacher_minutes": 1, "prep_minutes": 3, "materials": ["chalkboard"],
             "instruction": f"Show one worked {t} example on the board; {name} copies it before trying the next one."},
        ],
    }[category]


class MockClient:
    label = "Offline demo model"
    live = False
    can_translate = False

    def __init__(self, delay_seconds: float = 0.6, seed: int | None = None):
        self.delay = delay_seconds
        self._rng = random.Random(seed)

    def complete(self, messages, *, task, context, on_retry=None, deadline=None) -> Completion:
        if self.delay:
            time.sleep(self.delay * self._rng.uniform(0.6, 1.4))
        handler = getattr(self, f"_{task}", None)
        if handler is None:
            raise LLMError(f"The offline demo model cannot do '{task}'.")
        return Completion(text=json.dumps(handler(context)), duration_ms=int(self.delay * 1000))

    # ------------------------------------------------------------ agents

    def _lesson_analyst(self, ctx):
        req = ctx["request"]
        topic = req["topic"]
        minutes = req["constraints"]["lesson_minutes"]
        intro, model = max(2, round(minutes * 0.12)), round(minutes * 0.25)
        guided = round(minutes * 0.4)
        fractions = "fraction" in f"{topic} {req['objectives']}".lower()
        return {
            "objective_summary": req["objectives"].strip().rstrip(".") + ".",
            "success_criteria": [f"Learners can explain {topic.lower()} in their own words.",
                                 f"Learners can solve two {topic.lower()} examples correctly."],
            "key_vocabulary": ["whole", "equal parts", "half", "quarter"] if fractions else [topic.lower()],
            "demands": [
                {"kind": "listening", "description": "Follow the teacher's spoken explanation of the new idea",
                 "phase": "Modelling", "load": "high"},
                {"kind": "visual", "description": "Read diagrams and examples on the board", "phase": "Modelling", "load": "medium"},
                {"kind": "number_work" if req["subject"] == "Mathematics" else "new_vocabulary",
                 "description": f"Work with the symbols and words of {topic.lower()}", "phase": "Guided practice", "load": "high"},
                {"kind": "writing", "description": "Record answers in exercise books", "phase": "Exit check", "load": "medium"},
                {"kind": "group_work", "description": "Share materials fairly in small groups", "phase": "Guided practice", "load": "medium"},
            ],
            "flow": [
                {"label": "Introduction", "minutes": intro, "activity": f"Connect {topic.lower()} to sharing food at home"},
                {"label": "Modelling", "minutes": model, "activity": "Teacher demonstrates with board drawings"},
                {"label": "Guided practice", "minutes": guided, "activity": "Groups work with real objects"},
                {"label": "Exit check", "minutes": minutes - intro - model - guided, "activity": "Two quick questions in books"},
            ],
        }

    def _needs_matcher(self, ctx):
        needs = []
        for l in ctx["request"]["learners"]:
            cat = _category(l["support"])
            demand, barrier = {
                "visual": ("listening", "Long spoken explanations may be hard to hold on to"),
                "steps": ("sustained_attention", "Multi-step instructions given at once may be hard to follow"),
                "practical": ("number_work", "Abstract symbols may be hard without something to touch"),
                "general": ("number_work", "New symbols may need extra practice"),
            }[cat]
            needs.append({"learner_id": l["id"], "demand": demand, "barrier": barrier,
                          "leverage": l["support"] or l["strengths"] or "peer support", "priority": "high" if cat != "general" else "medium"})
        return {"needs": needs, "whole_class_considerations": [
            f"{ctx['request']['constraints']['class_size']} learners: keep materials simple to hand out"]}

    def _planner(self, ctx):
        req = ctx["request"]
        c = req["constraints"]
        learners = req["learners"]
        focus = {"visual": "show every idea as a picture", "steps": "one short step at a time",
                 "practical": "start with real objects", "general": "a buddy to check each answer"}
        priorities = [{"learner_id": l["id"], "focus": focus[_category(l["support"])],
                       "priority": "medium" if _category(l["support"]) == "general" else "high"} for l in learners]
        guidance = (f"Only {c['support_minutes']} minutes of one-to-one time for {c['class_size']} learners: "
                    "most support must be independent or buddy-based.")
        if c["noisy_venue"]:
            guidance += " The venue is noisy, so use visual and written cues instead of spoken instructions."
        risks = [f"{c['class_size']} learners share one teacher"]
        if not c["has_printer"]:
            risks.append("No printer: everything must be drawn on the board or made from scrap materials")
        if c["noisy_venue"]:
            risks.append("Noise will drown out spoken instructions")
        return {
            "summary": f"Teach {req['topic'].lower()} to the whole class and plan targeted support for "
                       f"{len(learners)} learner(s). The tight one-to-one budget is the main constraint.",
            "priorities": priorities,
            "personalise_for": [l["id"] for l in learners],
            "design_guidance": guidance,
            "risks": risks,
        }

    def _router(self, ctx):
        checks = {c for r in ctx["rejected"] for c in r.get("checks", [])}
        guidance = "Fix only the rejected items and keep the learning objective."
        if "teacher_time" in checks:
            guidance = "Replace one-to-one teacher time with an independent or buddy activity the learner can lead."
        elif "noise" in checks:
            guidance = "Swap spoken or listening steps for visual, written or gesture cues."
        return {"route": "designer",
                "reason": f"The problems ({', '.join(sorted(checks)) or 'quality'}) can be fixed by redesigning the "
                          "rejected item(s); the lesson analysis itself is sound.",
                "guidance": guidance}

    def _adaptation_designer(self, ctx):
        req = ctx["request"]
        c = req["constraints"]
        if ctx["mode"] == "revise":
            out = self._revise(ctx)
            first_turn = ctx.get("turn", 0) == 0
            return {**out, "action": "check" if first_turn else "submit",
                    "note": "Testing the fix with check_plan." if first_turn else "check_plan found no problems."}
        memory = [m for m in ctx.get("memory", []) if m["outcome"] == "Did not work"]
        out = []
        for i, l in enumerate(req["learners"]):
            options = _options(_category(l["support"]), l["name"], req["topic"])
            choice = options[0]
            if any(m["learner_id"] == l["id"] and similarity(m.get("strategy", "") + " " + m.get("instruction", ""),
                                                             choice["strategy"] + " " + choice["instruction"]) >= 0.4
                   for m in memory):
                choice = options[1]
            if i == 0:
                choice = {"strategy": "One-to-one re-teach", "teacher_minutes": 20, "prep_minutes": 5, "materials": ["chalkboard"],
                          "instruction": f"Sit with {l['name']} at your desk for a full re-teach of {req['topic'].lower()} using diagrams."}
            out.append({**choice, "learner_id": l["id"], "phase": "Guided practice",
                        "instruction": choice["instruction"] + self._language_line(l),
                        "addresses": l["support"] or "learner support profile"})
        if not c["has_printer"]:
            out.append({"learner_id": WHOLE_CLASS, "phase": "Modelling", "strategy": "Board examples",
                        "instruction": "Draw every example on the chalkboard instead of using printed worksheets.",
                        "teacher_minutes": 0, "prep_minutes": 5, "materials": ["chalkboard"], "addresses": "No printer"})
        if c["noisy_venue"]:
            out.append(self._hand_signals())
        return {"action": "submit", "note": "First draft.", "adaptations": out}

    def _revise(self, ctx):
        req = ctx["request"]
        learners = {l["id"]: l for l in req["learners"]}
        available = max(0, req["constraints"]["support_minutes"] - ctx["keep_minutes"])
        out = []
        for r in ctx["rejected"]:
            reasons = " ".join(r["reasons"]).lower()
            if r["learner_id"] == WHOLE_CLASS:
                out.append({**self._hand_signals(), "replaces": r["id"]})
                continue
            l = learners.get(r["learner_id"])
            if l is None:
                continue
            choice = dict(_options(_category(l["support"]), l["name"], req["topic"])[1])
            if "one-to-one" in reasons or "teacher time" in reasons:
                choice["teacher_minutes"] = 0
            choice["teacher_minutes"] = min(choice["teacher_minutes"], available)
            available -= choice["teacher_minutes"]
            out.append({**choice, "learner_id": l["id"], "phase": "Guided practice", "replaces": r["id"],
                        "instruction": choice["instruction"] + self._language_line(l),
                        "addresses": l["support"] or "learner support profile"})
        return {"adaptations": out}

    @staticmethod
    def _hand_signals():
        return {"learner_id": WHOLE_CLASS, "phase": "Introduction", "strategy": "Hand signals and written cues",
                "instruction": "Agree three hand signals (stop, look, show me) and point to written cues on the board instead of giving spoken instructions.",
                "teacher_minutes": 0, "prep_minutes": 2, "materials": ["chalkboard"], "addresses": "Noisy venue"}

    @staticmethod
    def _language_line(l):
        if l["language"] == "en":
            return ""
        return f" Mothusi prepares the explanation in {language_name(l['language'])} for {l['name']} to read with a buddy."

    def _reviewer(self, ctx):
        return {"verdicts": [{"adaptation_id": a["id"], "approved": True,
                              "reason": "Linked to the learner's stated support and keeps the objective."}
                             for a in ctx["adaptations"]],
                "objective_preserved": True, "summary": "Adaptations keep the objective and match the profiles."}

    def _personalisation(self, ctx):
        req = ctx["request"]
        learner = ctx.get("learner")
        style = ctx.get("style")
        topic = req["topic"]
        if "fraction" in f"{topic} {req['objectives']}".lower():
            material = {
                "title": "Sharing fairly: halves and quarters",
                "explanation": ["A fraction is a part of a whole.", "Cut a bread into 4 equal parts.",
                                "One part is one quarter. We write 1/4."],
                "everyday_example": "When you share an orange equally with a friend, you each get 1/2.",
                "activity": "Fold a piece of scrap paper into 4 equal parts. Colour 1 part. You made 1/4!",
                "practice": [
                    {"prompt": "Which picture shows 1/4?", "answer_index": 0, "hint": "Count the shaded parts. Then count all the parts.",
                     "options": [{"text": "1 of 4", "fraction": {"parts": 4, "shaded": 1}},
                                 {"text": "3 of 4", "fraction": {"parts": 4, "shaded": 3}},
                                 {"text": "1 of 2", "fraction": {"parts": 2, "shaded": 1}}]},
                    {"prompt": "Which picture shows 1/2?", "answer_index": 2, "hint": "Half means 2 equal parts.",
                     "options": [{"text": "3 of 4", "fraction": {"parts": 4, "shaded": 3}},
                                 {"text": "1 of 3", "fraction": {"parts": 3, "shaded": 1}},
                                 {"text": "1 of 2", "fraction": {"parts": 2, "shaded": 1}}]},
                    {"prompt": "Two friends share 1 bread equally. What does each friend get?", "answer_index": 0,
                     "hint": "There are 2 friends, so cut the bread into 2 equal parts.",
                     "options": [{"text": "1/2"}, {"text": "1/4"}, {"text": "2"}]},
                ],
                "teacher_tip": "Let learners show their folded paper before they write the fraction.",
            }
        else:
            t = topic.lower()
            material = {
                "title": f"Let's learn about {t}",
                "explanation": [f"Today we learn about {t}.", "Look at the example on the board.",
                                "Then try one with a friend."],
                "everyday_example": f"Think of where you see {t} at home or on the way to school.",
                "activity": f"With a buddy, find two things in the classroom that show {t}. Draw them in your book.",
                "practice": [
                    {"prompt": "What are we learning about today?", "answer_index": 0, "hint": "Look at the title.",
                     "options": [{"text": topic}, {"text": "Colours"}, {"text": "Animals"}]},
                    {"prompt": "Who can help you check your answer?", "answer_index": 1, "hint": "Someone next to you.",
                     "options": [{"text": "Nobody"}, {"text": "My buddy"}]},
                ],
                "teacher_tip": "Ask two learners to show their drawings to the class.",
            }
        if style == "simpler":
            material["explanation"] = [s for s in material["explanation"]][:2] + ["Take it one small step at a time."]
        elif style == "practical":
            material["explanation"] = material["explanation"][:2] + ["Use your hands to show it."]
        elif style == "visual":
            material["explanation"] = material["explanation"][:2] + ["Draw a picture to show it."]
        return material
