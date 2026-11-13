import json
import re
import time
from dataclasses import dataclass
from typing import Any, Callable, Protocol

import openai

from config import Settings

RetryHook = Callable[[int, str], None]


class LLMError(Exception):
    """The model could not be reached or refused the request. Message is safe to show a teacher."""


@dataclass
class Completion:
    text: str
    reasoning: str = ""
    duration_ms: int = 0
    tokens: int | None = None
    truncated: bool = False
    model: str = ""


class LLMClient(Protocol):
    label: str
    live: bool
    can_translate: bool

    def complete(self, messages: list[dict[str, str]], *, task: str, context: dict[str, Any],
                 on_retry: RetryHook | None = None) -> Completion: ...


_THINK = re.compile(r"<think>(.*?)</think>", re.DOTALL | re.IGNORECASE)


LANGUAGE_TASKS = {"translator", "translation_checker"}


class NvidiaClient:
    """OpenAI-compatible client for NVIDIA's hosted models.

    Planning agents use a fast model and think only on tasks that need judgement; translation uses a larger
    model because the small one handles South African languages poorly.
    """

    live = True
    can_translate = True
    RETRY_DELAYS = (2.0, 5.0)

    def __init__(self, settings: Settings):
        self.model = settings.model
        self.language_model = settings.language_model
        self.reasoning_tasks = settings.reasoning_tasks
        self.label = f"{settings.model} (live)"
        self.temperature = settings.temperature
        self._client = openai.OpenAI(
            api_key=settings.api_key,
            base_url=settings.base_url,
            timeout=settings.timeout_seconds,
            max_retries=0,
        )

    def complete(self, messages, *, task, context, on_retry=None) -> Completion:
        attempt = 0
        while True:
            started = time.monotonic()
            model = self.language_model if task in LANGUAGE_TASKS else self.model
            extra = None
            if model == self.model:
                extra = {"chat_template_kwargs": {"enable_thinking": task in self.reasoning_tasks}}
            try:
                resp = self._client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=self.temperature,
                    max_tokens=8000,
                    extra_body=extra,
                )
            except (openai.APITimeoutError, openai.APIConnectionError, openai.RateLimitError,
                    openai.InternalServerError) as exc:
                if attempt >= len(self.RETRY_DELAYS):
                    raise LLMError(f"The language model is not responding ({type(exc).__name__}).") from exc
                delay = self.RETRY_DELAYS[attempt]
                attempt += 1
                if on_retry:
                    on_retry(attempt, f"{type(exc).__name__}; retrying in {delay:.0f}s")
                time.sleep(delay)
                continue
            except openai.AuthenticationError as exc:
                raise LLMError("The language model rejected the API key. Check NVIDIA_API_KEY.") from exc
            except openai.APIStatusError as exc:
                raise LLMError(f"The language model returned an error ({exc.status_code}).") from exc

            duration = int((time.monotonic() - started) * 1000)
            if not resp.choices:
                raise LLMError("The language model returned an empty response.")
            msg = resp.choices[0].message
            content = msg.content or ""
            reasoning = getattr(msg, "reasoning_content", None) or (msg.model_extra or {}).get("reasoning_content") or ""
            thoughts = _THINK.findall(content)
            if thoughts:
                reasoning = reasoning or "\n".join(t.strip() for t in thoughts)
                content = _THINK.sub("", content)
            tokens = resp.usage.total_tokens if resp.usage else None
            return Completion(text=content.strip(), reasoning=reasoning.strip(), duration_ms=duration, tokens=tokens,
                              truncated=resp.choices[0].finish_reason == "length", model=model)


def extract_json(text: str) -> Any:
    """Pull the first JSON object out of a model reply (tolerates prose, fences and think tags)."""
    cleaned = _THINK.sub("", text)
    cleaned = re.sub(r"<think>.*$", "", cleaned, flags=re.DOTALL | re.IGNORECASE)
    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", cleaned):
        try:
            value, _ = decoder.raw_decode(cleaned, match.start())
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    raise ValueError("The reply did not contain a JSON object.")


def build_client(settings: Settings, offline: bool = False) -> LLMClient:
    if offline or settings.provider == "mock":
        from llm.mock import MockClient
        return MockClient(delay_seconds=settings.mock_delay_seconds)
    return NvidiaClient(settings)
