import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from storage.db import IntegrityErrors, Tx, connect


SESSION_DAYS = 30
PBKDF2_ITERATIONS = 600_000

AUTH_SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
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
CREATE TABLE IF NOT EXISTS join_codes (
    code TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    learner_profile_id TEXT,
    learner_label TEXT,
    created_at TEXT NOT NULL,
    revoked_at TEXT,
    claimed_by TEXT,
    claimed_at TEXT
);
CREATE INDEX IF NOT EXISTS join_codes_teacher ON join_codes (teacher_id);
CREATE TABLE IF NOT EXISTS learner_links (
    learner_account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    teacher_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    learner_profile_id TEXT,
    learner_label TEXT,
    joined_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS learner_links_teacher ON learner_links (teacher_id);
CREATE TABLE IF NOT EXISTS picture_logins (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    teacher_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    learner_profile_id TEXT NOT NULL,
    picture_hash TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (teacher_id, learner_profile_id)
);
CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT
);
"""

# The nine pictures a young learner chooses from. Order matters: a picture password is three in a row.
PICTURES = ("sun", "tree", "ball", "cat", "fish", "star", "car", "apple", "house")
PICTURE_LOCK_ATTEMPTS = 5
PICTURE_LOCK_MINUTES = 10
RESET_HOURS = 1

# No 0/O or 1/I so codes are easy to read aloud and copy from the board.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_join_code() -> str:
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


def normalise_code(code: str) -> str:
    raw = "".join(ch for ch in (code or "").upper() if ch.isalnum())
    return f"{raw[:4]}-{raw[4:]}" if len(raw) == 8 else raw


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


def _public_account(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "role": row["role"],
        "profile": json.loads(row["profile_json"]),
    }


def _link(t: Tx, account_id: str, teacher_id: str, class_id: str, class_name: str,
          profile_id: str | None, label: str | None, now: str) -> None:
    """Link a learner account to a class (and a profile), replacing any earlier link."""
    t.execute(
        "INSERT INTO learner_links (learner_account_id, teacher_id, class_id, class_name, learner_profile_id,"
        " learner_label, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        " ON CONFLICT (learner_account_id) DO UPDATE SET teacher_id = excluded.teacher_id,"
        " class_id = excluded.class_id, class_name = excluded.class_name,"
        " learner_profile_id = excluded.learner_profile_id, learner_label = excluded.learner_label,"
        " joined_at = excluded.joined_at",
        (account_id, teacher_id, class_id, class_name, profile_id, label, now),
    )


class AuthStore:
    def __init__(self, path: Path | str):
        self.db = connect(path)
        self.db.create(AUTH_SCHEMA)

    def create_account(self, email: str, password: str, role: str, profile: dict[str, Any]) -> dict[str, Any] | None:
        account_id = secrets.token_urlsafe(18)
        created_at = _utc_now().isoformat()
        password_hash = _hash_password(password)
        try:
            self.db.run(
                "INSERT INTO accounts (id, email, role, password_hash, profile_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (account_id, email.strip().lower(), role, password_hash, json.dumps(profile), created_at),
            )
        except IntegrityErrors:
            return None
        return self.get_account(account_id)

    def get_account(self, account_id: str) -> dict[str, Any] | None:
        row = self.db.one("SELECT * FROM accounts WHERE id = ?", (account_id,))
        return _public_account(row) if row else None

    def authenticate(self, email: str, password: str) -> dict[str, Any] | None:
        row = self.db.one("SELECT * FROM accounts WHERE email = ?", (email.strip().lower(),))
        if row is None or not _verify_password(password, row["password_hash"]):
            return None
        return _public_account(row)

    def create_session(self, account_id: str) -> str:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        now = _utc_now()
        with self.db.tx() as t:
            t.execute(
                "INSERT INTO auth_sessions (token_hash, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (token_hash, account_id, (now + timedelta(days=SESSION_DAYS)).isoformat(), now.isoformat()),
            )
            t.execute("DELETE FROM auth_sessions WHERE expires_at <= ?", (now.isoformat(),))
        return token

    def account_for_session(self, token: str) -> dict[str, Any] | None:
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        now = _utc_now().isoformat()
        row = self.db.one(
            "SELECT a.* FROM auth_sessions s JOIN accounts a ON a.id = s.account_id"
            " WHERE s.token_hash = ? AND s.expires_at > ?",
            (token_hash, now),
        )
        return _public_account(row) if row else None

    def revoke_session(self, token: str) -> None:
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        self.db.run("DELETE FROM auth_sessions WHERE token_hash = ?", (token_hash,))

    def update_profile(self, account_id: str, profile: dict[str, Any], email: str) -> dict[str, Any] | None:
        with self.db.tx() as t:
            t.execute("UPDATE accounts SET email = ?, profile_json = ? WHERE id = ?",
                      (email.strip().lower(), json.dumps(profile), account_id))
            row = t.one("SELECT * FROM accounts WHERE id = ?", (account_id,))
        return _public_account(row) if row else None

    # ------------------------------------------------------------ teacher-issued join codes

    def issue_code(self, teacher_id: str, class_id: str, class_name: str,
                   learner_profile_id: str | None = None, learner_label: str | None = None) -> dict[str, Any]:
        """A personal code (one learner, single use) or a class code (any learner in the class).

        Issuing a new code retires the previous unused code for the same class or learner.
        """
        now = _utc_now().isoformat()
        with self.db.tx() as t:
            t.execute(
                "UPDATE join_codes SET revoked_at = ? WHERE teacher_id = ? AND class_id = ?"
                " AND learner_profile_id IS NOT DISTINCT FROM ? AND revoked_at IS NULL AND claimed_by IS NULL",
                (now, teacher_id, class_id, learner_profile_id),
            )
            code = new_join_code()
            while t.one("SELECT 1 AS taken FROM join_codes WHERE code = ?", (code,)):
                code = new_join_code()  # about one in a trillion; check first so the transaction stays clean
            t.execute(
                "INSERT INTO join_codes (code, teacher_id, class_id, class_name, learner_profile_id,"
                " learner_label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (code, teacher_id, class_id, class_name, learner_profile_id, learner_label, now),
            )
        return {"code": code, "class_id": class_id, "class_name": class_name,
                "learner_profile_id": learner_profile_id, "learner_label": learner_label, "created_at": now}

    @staticmethod
    def _usable_code(t: Tx, code: str) -> dict[str, Any] | None:
        row = t.one("SELECT * FROM join_codes WHERE code = ?", (normalise_code(code),))
        if row is None or row["revoked_at"] or (row["learner_profile_id"] and row["claimed_by"]):
            return None
        return row

    def code_target(self, code: str) -> dict[str, Any] | None:
        """What a usable code opens: the teacher, the class and, for a personal code, the learner profile."""
        with self.db.tx() as t:
            row = self._usable_code(t, code)
        if row is None:
            return None
        return {"teacher_id": row["teacher_id"], "class_id": row["class_id"], "class_name": row["class_name"],
                "learner_profile_id": row["learner_profile_id"]}

    def code_is_valid(self, code: str) -> bool:
        with self.db.tx() as t:
            return self._usable_code(t, code) is not None

    def redeem_code(self, code: str, learner_account_id: str) -> dict[str, Any] | None:
        now = _utc_now().isoformat()
        with self.db.tx() as t:
            row = self._usable_code(t, code)
            if row is None:
                return None
            if row["learner_profile_id"]:
                t.execute("UPDATE join_codes SET claimed_by = ?, claimed_at = ? WHERE code = ?",
                          (learner_account_id, now, row["code"]))
                # A learner profile belongs to one account at a time.
                t.execute(
                    "DELETE FROM learner_links WHERE teacher_id = ? AND learner_profile_id = ? AND learner_account_id != ?",
                    (row["teacher_id"], row["learner_profile_id"], learner_account_id))
            _link(t, learner_account_id, row["teacher_id"], row["class_id"], row["class_name"],
                  row["learner_profile_id"], row["learner_label"], now)
        return self.link_for_learner(learner_account_id)

    def link_for_learner(self, learner_account_id: str) -> dict[str, Any] | None:
        row = self.db.one(
            "SELECT l.*, a.profile_json AS teacher_profile FROM learner_links l"
            " JOIN accounts a ON a.id = l.teacher_id WHERE l.learner_account_id = ?",
            (learner_account_id,),
        )
        if row is None:
            return None
        teacher = json.loads(row["teacher_profile"])
        return {"teacher_id": row["teacher_id"], "teacher_name": teacher.get("fullName", "Your teacher"),
                "class_id": row["class_id"], "class_name": row["class_name"],
                "learner_profile_id": row["learner_profile_id"], "joined_at": row["joined_at"]}

    def teacher_roster(self, teacher_id: str) -> dict[str, list[dict[str, Any]]]:
        with self.db.tx() as t:
            codes = t.all(
                "SELECT code, class_id, class_name, learner_profile_id, learner_label, created_at FROM join_codes"
                " WHERE teacher_id = ? AND revoked_at IS NULL AND claimed_by IS NULL ORDER BY created_at",
                (teacher_id,),
            )
            links = t.all(
                "SELECT l.learner_account_id, l.class_id, l.class_name, l.learner_profile_id, l.learner_label,"
                " l.joined_at, a.profile_json FROM learner_links l JOIN accounts a ON a.id = l.learner_account_id"
                " WHERE l.teacher_id = ? ORDER BY l.joined_at",
                (teacher_id,),
            )
        return {
            "codes": codes,
            "learners": [{"account_id": r["learner_account_id"], "name": json.loads(r["profile_json"]).get("fullName"),
                          "class_id": r["class_id"], "class_name": r["class_name"],
                          "learner_profile_id": r["learner_profile_id"], "learner_label": r["learner_label"],
                          "joined_at": r["joined_at"]} for r in links],
        }

    def revoke_code(self, teacher_id: str, code: str) -> bool:
        return self.db.run(
            "UPDATE join_codes SET revoked_at = ? WHERE code = ? AND teacher_id = ? AND revoked_at IS NULL",
            (_utc_now().isoformat(), normalise_code(code), teacher_id)) > 0

    def unlink_learner(self, teacher_id: str, learner_account_id: str) -> bool:
        return self.db.run("DELETE FROM learner_links WHERE teacher_id = ? AND learner_account_id = ?",
                           (teacher_id, learner_account_id)) > 0

    # ------------------------------------------------------------ picture sign-in for young learners

    @staticmethod
    def valid_pictures(pictures: list[str]) -> bool:
        return len(pictures) == 3 and all(p in PICTURES for p in pictures)

    def picture_profiles(self, teacher_id: str) -> set[str]:
        rows = self.db.all("SELECT learner_profile_id FROM picture_logins WHERE teacher_id = ?", (teacher_id,))
        return {r["learner_profile_id"] for r in rows}

    def picture_setup(self, teacher_id: str, class_id: str, class_name: str, profile: dict[str, Any],
                      pictures: list[str], learner_profile: dict[str, Any]) -> dict[str, Any] | None:
        """First sign-in for a learner on the class list: they choose their picture password.

        Returns None when this learner already has a picture password (they must sign in instead).
        """
        profile_id = learner_profile["id"]
        now = _utc_now().isoformat()
        picture_hash = _hash_password(",".join(pictures))  # slow on purpose, so done before the transaction
        unused_password = _hash_password(secrets.token_urlsafe(32))
        with self.db.tx() as t:
            if t.one("SELECT 1 AS found FROM picture_logins WHERE teacher_id = ? AND learner_profile_id = ?",
                     (teacher_id, profile_id)):
                return None
            linked = t.one("SELECT learner_account_id FROM learner_links WHERE teacher_id = ? AND learner_profile_id = ?",
                           (teacher_id, profile_id))
            if linked:
                account_id = linked["learner_account_id"]
            else:
                account_id = secrets.token_urlsafe(18)
                email = f"picture-{secrets.token_hex(8)}@learners.mothusi.invalid"
                t.execute(
                    "INSERT INTO accounts (id, email, role, password_hash, profile_json, created_at)"
                    " VALUES (?, ?, 'learner', ?, ?, ?)",
                    (account_id, email, unused_password, json.dumps(profile), now))
            t.execute(
                "INSERT INTO picture_logins (account_id, teacher_id, class_id, learner_profile_id, picture_hash, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (account_id, teacher_id, class_id, profile_id, picture_hash, now))
            _link(t, account_id, teacher_id, class_id, class_name, profile_id, learner_profile.get("name"), now)
        return self.get_account(account_id)

    def picture_login(self, teacher_id: str, profile_id: str, pictures: list[str]) -> tuple[dict[str, Any] | None, str]:
        """Returns (account, "") on success, or (None, reason) where reason is "wrong", "locked" or "missing"."""
        now = _utc_now()
        with self.db.tx() as t:
            row = t.one("SELECT * FROM picture_logins WHERE teacher_id = ? AND learner_profile_id = ?",
                        (teacher_id, profile_id))
            if row is None:
                return None, "missing"
            if row["locked_until"] and row["locked_until"] > now.isoformat():
                return None, "locked"
            if not _verify_password(",".join(pictures), row["picture_hash"]):
                attempts = row["failed_attempts"] + 1
                locked = (now + timedelta(minutes=PICTURE_LOCK_MINUTES)).isoformat() if attempts >= PICTURE_LOCK_ATTEMPTS else None
                t.execute("UPDATE picture_logins SET failed_attempts = ?, locked_until = ? WHERE account_id = ?",
                          (0 if locked else attempts, locked, row["account_id"]))
                return None, "locked" if locked else "wrong"
            t.execute("UPDATE picture_logins SET failed_attempts = 0, locked_until = NULL WHERE account_id = ?",
                      (row["account_id"],))
            account_id = row["account_id"]
        return self.get_account(account_id), ""

    def reset_pictures(self, teacher_id: str, profile_id: str) -> bool:
        return self.db.run("DELETE FROM picture_logins WHERE teacher_id = ? AND learner_profile_id = ?",
                           (teacher_id, profile_id)) > 0

    # ------------------------------------------------------------ password recovery

    def create_reset_token(self, email: str) -> tuple[str, dict[str, Any]] | None:
        row = self.db.one("SELECT * FROM accounts WHERE email = ?", (email.strip().lower(),))
        if row is None or row["email"].endswith(".invalid"):
            return None
        token = secrets.token_urlsafe(32)
        expires = (_utc_now() + timedelta(hours=RESET_HOURS)).isoformat()
        self.db.run("INSERT INTO password_resets (token_hash, account_id, expires_at) VALUES (?, ?, ?)",
                    (hashlib.sha256(token.encode()).hexdigest(), row["id"], expires))
        return token, _public_account(row)

    def reset_password(self, token: str, new_password: str) -> bool:
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        now = _utc_now().isoformat()
        new_hash = _hash_password(new_password)  # slow on purpose, so done before the transaction
        with self.db.tx() as t:
            row = t.one("SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
                        (token_hash, now))
            if row is None:
                return False
            t.execute("UPDATE accounts SET password_hash = ? WHERE id = ?", (new_hash, row["account_id"]))
            t.execute("UPDATE password_resets SET used_at = ? WHERE token_hash = ?", (now, token_hash))
            t.execute("DELETE FROM auth_sessions WHERE account_id = ?", (row["account_id"],))
        return True
