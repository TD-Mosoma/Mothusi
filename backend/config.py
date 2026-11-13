import os
import re
from urllib.parse import quote
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
    public_url: str = "http://localhost:5173"
    show_reset_links: bool = False
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    database_url: str | None = None  # PostgreSQL (for example Supabase); the SQLite file at db_path is used without it

    @property
    def database(self) -> str | Path:
        """Where Mothusi keeps its data: the PostgreSQL URL when set, otherwise the local SQLite file."""
        return self.database_url or self.db_path


def normalise_database_url(url: str | None) -> str | None:
    """Percent-encode the password in a PostgreSQL URL, so a password with symbols (@ : / # ? % and so on) can be
    pasted as it is. A password that is already percent-encoded is left alone."""
    url = (url or "").strip()
    if not url or "://" not in url or "@" not in url:
        return url or None
    scheme, rest = url.split("://", 1)
    at = rest.rfind("@")  # the host never contains @, so the last one ends the password
    userinfo, host = rest[:at], rest[at + 1:]
    if ":" not in userinfo:
        return url
    user, password = userinfo.split(":", 1)
    if not re.fullmatch(r"(?:[A-Za-z0-9\-._~]|%[0-9A-Fa-f]{2})*", password):
        password = quote(password, safe="")
    return f"{scheme}://{user}:{password}@{host}"


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
        public_url=os.getenv("MOTHUSI_PUBLIC_URL", "http://localhost:5173").rstrip("/"),
        show_reset_links=os.getenv("MOTHUSI_SHOW_RESET_LINKS", "").strip().lower() in {"1", "true", "yes"},
        smtp_host=os.getenv("MOTHUSI_SMTP_HOST") or None,
        smtp_port=int(os.getenv("MOTHUSI_SMTP_PORT", "587")),
        smtp_user=os.getenv("MOTHUSI_SMTP_USER") or None,
        smtp_password=os.getenv("MOTHUSI_SMTP_PASSWORD") or None,
        smtp_from=os.getenv("MOTHUSI_SMTP_FROM") or None,
        database_url=normalise_database_url(os.getenv("MOTHUSI_DATABASE_URL")),
    )
