"""Keeps diagnostic and deficit labels out of what agents read and write."""

import re

_LABELS = [
    r"adhd", r"add/adhd", r"autis\w*", r"asd", r"asperger\w*", r"dyslexi\w*", r"dyscalcul\w*", r"dyspraxi\w*",
    r"dysgraphi\w*", r"ocd", r"epilep\w*", r"cerebral palsy", r"down'?s? syndrome", r"depress\w*",
    r"anxiety disorder",
    r"disorder\w*", r"diagnos\w*", r"syndrome", r"learning disabilit\w*", r"intellectual disabilit\w*",
    r"impairment", r"slow learner\w*", r"weak learner\w*", r"lazy", r"retard\w*", r"special needs",
]
_PATTERN = re.compile(r"\b(" + "|".join(_LABELS) + r")\b", re.IGNORECASE)


def find_labels(text: str) -> list[str]:
    return sorted({m.group(0).lower() for m in _PATTERN.finditer(text or "")})


def redact_labels(text: str) -> str:
    return _PATTERN.sub("[label removed]", text or "")
