"""Scope of the platform: South African Grades 1–4 (CAPS)."""

GRADES = ["Grade 1", "Grade 2", "Grade 3", "Grade 4"]

_FOUNDATION_SUBJECTS = ["Mathematics", "Home Language", "First Additional Language", "Life Skills"]

SUBJECTS_BY_GRADE: dict[str, list[str]] = {
    "Grade 1": _FOUNDATION_SUBJECTS,
    "Grade 2": _FOUNDATION_SUBJECTS,
    "Grade 3": _FOUNDATION_SUBJECTS,
    "Grade 4": [
        "Mathematics", "Home Language", "First Additional Language",
        "Natural Sciences and Technology", "Social Sciences", "Life Skills",
    ],
}

AGE_RANGE = {"Grade 1": "6–7", "Grade 2": "7–8", "Grade 3": "8–9", "Grade 4": "9–10"}

# Longest comfortable sentence for a young reader at each grade, in words.
MAX_SENTENCE_WORDS = {"Grade 1": 10, "Grade 2": 12, "Grade 3": 14, "Grade 4": 16}

LANGUAGES = {"en": "English", "tn": "Setswana", "zu": "isiZulu", "xh": "isiXhosa"}
