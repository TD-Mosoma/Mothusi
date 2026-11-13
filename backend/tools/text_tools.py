import re

_STOP = {
    "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with", "at", "by", "is", "are", "be",
    "it", "this", "that", "their", "them", "they", "he", "she", "his", "her", "learner", "learners",
    "use", "using", "each", "one", "as", "from", "then", "so", "can", "will", "while", "into", "up",
}


def content_words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", (text or "").lower()) if len(w) > 2 and w not in _STOP}


def similarity(a: str, b: str) -> float:
    wa, wb = content_words(a), content_words(b)
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text or "") if s.strip()]


def word_count(text: str) -> int:
    return len(re.findall(r"\S+", text or ""))


def numbers_in(text: str) -> list[str]:
    return re.findall(r"\d+(?:[/.,]\d+)*", text or "")
