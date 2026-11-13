from collections import Counter

from orchestration.events import RunTrace
from llm.client import LLMClient
from models.schemas import LearnerMaterial, Translation, TranslationCheck, language_name
from tools.text_tools import numbers_in
from agents.base import Agent, compact


def flatten(m: LearnerMaterial) -> list[str]:
    out = [m.title, *m.explanation, m.everyday_example, m.activity]
    for q in m.practice:
        out += [q.prompt, *(o.text for o in q.options), q.hint]
    return out


def rebuild(m: LearnerMaterial, texts: list[str]) -> LearnerMaterial:
    it = iter(texts)
    data = m.model_dump()
    data["title"] = next(it)
    data["explanation"] = [next(it) for _ in m.explanation]
    data["everyday_example"] = next(it)
    data["activity"] = next(it)
    for q in data["practice"]:
        q["prompt"] = next(it)
        for o in q["options"]:
            o["text"] = next(it)
        q["hint"] = next(it)
    return LearnerMaterial.model_validate(data)


def mechanical_issues(source: list[str], target: list[str]) -> list[str]:
    if len(source) != len(target):
        return [f"Expected {len(source)} translated lines but got {len(target)}."]
    issues = []
    for i, (s, t) in enumerate(zip(source, target), 1):
        missing = Counter(numbers_in(s)) - Counter(numbers_in(t))
        if missing:
            issues.append(f"Line {i} lost the number(s) {', '.join(missing)}: \"{t}\"")
    untranslated = [s for s, t in zip(source, target) if s.strip() == t.strip() and len(s.split()) > 2]
    if len(untranslated) > len(source) * 0.25:
        issues.append(f"{len(untranslated)} lines were left in English.")
    return issues


class TranslationChecker(Agent):
    name = "Reviewer"
    task = "translation_checker"
    system = (
        "You are the Reviewer checking a translation of learning material for young children. Translate the "
        "material back into English and judge whether the educational meaning is preserved: same numbers, same "
        "maths or concept, same instructions, child-friendly wording."
    )


class LanguageAgent(Agent):
    name = "Language Agent"
    task = "translator"
    system = (
        "You are the Language Agent. You translate learning material for young South African children into the "
        "language their teacher or family selected. Use everyday words a child of this age hears at home and in "
        "class. Keep every number and fraction written in digits exactly as it is (for example 1/4 stays 1/4)."
    )

    def __init__(self):
        self.checker = TranslationChecker()

    def run(self, llm: LLMClient, trace: RunTrace, material: LearnerMaterial, lang: str, grade: str,
            who: str, max_attempts: int = 2) -> dict:
        language = language_name(lang)
        source = flatten(material)
        feedback: list[str] = []
        last: dict = {"language": lang, "status": "failed", "material": None, "issues": [], "back_translation": ""}

        for attempt in range(1, max_attempts + 1):
            trace.emit(self.name, "agent_started", f"Translating material for {who} into {language}"
                       + (f" (attempt {attempt})" if attempt > 1 else ""), f"{len(source)} lines")
            prompt = (
                f"Translate each line into {language} for a {grade} learner. Return exactly {len(source)} lines in "
                f"the same order.\n"
                + (f"Your previous translation had problems. Fix them: {' | '.join(feedback)}\n" if feedback else "")
                + f"\nLines:\n{compact(source)}\n\nShape:\n{{\"translations\": [\"line 1\", \"line 2\"]}}"
            )
            result, completion, ms = self.call(llm, trace, prompt, Translation,
                                               context={"lines": source, "language": lang, "attempt": attempt})
            self.output(trace, f"Drafted {language} version for {who}", f"{len(result.translations)} lines translated",
                        {"sample": result.translations[:3]}, completion, ms)

            issues = mechanical_issues(source, result.translations)
            trace.emit("Reviewer", "tool", f"Checked {language} lines for numbers and completeness",
                       "No problems found" if not issues else f"{len(issues)} problem(s)")
            if issues:
                for issue in issues:
                    trace.emit("Reviewer", "check_failed", f"Rejected {language} translation for {who}", issue)
                feedback = issues
                last.update(issues=issues)
                continue

            translated = rebuild(material, result.translations)
            trace.emit("Reviewer", "agent_started", f"Back-translating the {language} version to check meaning")
            check, completion, ms = self.checker.call(
                llm, trace,
                f"Original English lines:\n{compact(source)}\n\n{language} translation:\n{compact(result.translations)}\n\n"
                "Shape:\n{\"meaning_preserved\": true, \"issues\": [\"...\"], \"back_translation\": \"short English back-translation of the explanation\"}",
                TranslationCheck,
                context={"lines": source, "language": lang},
            )
            self.checker.output(trace, "Back-translation compared with the original",
                                check.back_translation[:300], {"issues": check.issues}, completion, ms)
            last = {"language": lang, "material": translated, "issues": check.issues,
                    "back_translation": check.back_translation}
            if check.meaning_preserved:
                last["status"] = "checked"
                trace.emit("Reviewer", "check_passed", f"{language} translation for {who} keeps the meaning",
                           "Marked as an AI draft: a fluent speaker should still check it before use.")
                return last
            last["status"] = "needs_review"
            feedback = check.issues or ["The meaning changed in translation."]
            for issue in feedback:
                trace.emit("Reviewer", "check_failed", f"{language} translation changed the meaning", issue)

        trace.emit(self.name, "warning", f"{language} translation for {who} still needs a human check",
                   f"Stopped after {max_attempts} attempts. The English version will be shown with a note.",
                   {"issues": last["issues"]})
        if last["material"] is None:
            last["status"] = "failed"
        return last
