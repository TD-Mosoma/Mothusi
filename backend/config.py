import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    provider: str
    api_key: str | None
    base_url: str
    model: str
    language_model: str
    reasoning_tasks: frozenset[str]
    temperature: float
    timeout_seconds: float
    max_design_attempts: int
    max_material_attempts: int
    mock_delay_seconds: float
    db_path: Path
    cors_origins: list[str] = field(default_factory=list)


def load_settings() -> Settings:
    api_key = os.getenv("NVIDIA_API_KEY") or None
    provider = os.getenv("MOTHUSI_LLM_PROVIDER", "auto").strip().lower()
    if provider == "auto":
        provider = "nvidia" if api_key else "mock"
    if provider not in {"nvidia", "mock"}:
        raise ValueError(f"MOTHUSI_LLM_PROVIDER must be auto, nvidia or mock, not {provider!r}")
    if provider == "nvidia" and not api_key:
        raise ValueError("MOTHUSI_LLM_PROVIDER=nvidia needs NVIDIA_API_KEY in backend/.env")

    origins = os.getenv("MOTHUSI_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return Settings(
        provider=provider,
        api_key=api_key,
        base_url=os.getenv("MOTHUSI_LLM_BASE_URL", "https://integrate.api.nvidia.com/v1"),
        model=os.getenv("MOTHUSI_LLM_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"),
        language_model=os.getenv("MOTHUSI_LANGUAGE_MODEL", "nvidia/nemotron-3-ultra-550b-a55b"),
        reasoning_tasks=frozenset(t.strip() for t in os.getenv(
            "MOTHUSI_REASONING_TASKS", "lesson_analyst,adaptation_designer,reviewer").split(",") if t.strip()),
        temperature=float(os.getenv("MOTHUSI_LLM_TEMPERATURE", "0.3")),
        timeout_seconds=float(os.getenv("MOTHUSI_LLM_TIMEOUT", "180")),
        max_design_attempts=int(os.getenv("MOTHUSI_MAX_DESIGN_ATTEMPTS", "3")),
        max_material_attempts=int(os.getenv("MOTHUSI_MAX_MATERIAL_ATTEMPTS", "2")),
        mock_delay_seconds=float(os.getenv("MOTHUSI_MOCK_DELAY", "0.6")),
        db_path=Path(os.getenv("MOTHUSI_DB_PATH", str(BACKEND_DIR / "data" / "mothusi.db"))),
        cors_origins=[o.strip() for o in origins.split(",") if o.strip()],
    )
