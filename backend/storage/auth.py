import hashlib
import hmac
import json
import secrets
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


SESSION_DAYS = 30
PBKDF2_ITERATIONS = 600_000

AUTH_SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL CHECK (role IN ('learner', 'teacher')),
    password_hash TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_account ON auth_sessions (account_id);
"""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def _public_account(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "role": row["role"],
        "profile": json.loads(row["profile_json"]),
    }


class AuthStore:
    def __init__(self, path: Path | str):
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        with self._lock, self._conn:
            self._conn.executescript(AUTH_SCHEMA)

    def create_account(self, email: str, password: str, role: str, profile: dict[str, Any]) -> dict[str, Any] | None:
        account_id = secrets.token_urlsafe(18)
        created_at = _utc_now().isoformat()
        password_hash = _hash_password(password)
        try:
            with self._lock, self._conn:
                self._conn.execute(
                    "INSERT INTO accounts (id, email, role, password_hash, profile_json, created_at)"
                    " VALUES (?, ?, ?, ?, ?, ?)",
                    (account_id, email.strip().lower(), role, password_hash, json.dumps(profile), created_at),
                )
        except sqlite3.IntegrityError:
            return None
        return self.get_account(account_id)

    def get_account(self, account_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        return _public_account(row) if row else None

    def authenticate(self, email: str, password: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM accounts WHERE email = ? COLLATE NOCASE", (email.strip(),)).fetchone()
        if row is None or not _verify_password(password, row["password_hash"]):
            return None
        return _public_account(row)

    def create_session(self, account_id: str) -> str:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        now = _utc_now()
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO auth_sessions (token_hash, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (token_hash, account_id, (now + timedelta(days=SESSION_DAYS)).isoformat(), now.isoformat()),
            )
            self._conn.execute("DELETE FROM auth_sessions WHERE expires_at <= ?", (now.isoformat(),))
        return token

    def account_for_session(self, token: str) -> dict[str, Any] | None:
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        now = _utc_now().isoformat()
        with self._lock, self._conn:
            row = self._conn.execute(
                "SELECT a.* FROM auth_sessions s JOIN accounts a ON a.id = s.account_id"
                " WHERE s.token_hash = ? AND s.expires_at > ?",
                (token_hash, now),
            ).fetchone()
            self._conn.execute("DELETE FROM auth_sessions WHERE expires_at <= ?", (now,))
        return _public_account(row) if row else None

    def revoke_session(self, token: str) -> None:
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        with self._lock, self._conn:
            self._conn.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (token_hash,))

    def update_profile(self, account_id: str, profile: dict[str, Any], email: str) -> dict[str, Any] | None:
        with self._lock, self._conn:
            self._conn.execute(
                "UPDATE accounts SET email = ?, profile_json = ? WHERE id = ?",
                (email, json.dumps(profile), account_id),
            )
            row = self._conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        return _public_account(row) if row else None
