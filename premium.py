"""WIRING+ grants, promo codes, and feature checks."""

from __future__ import annotations

import secrets
import time

from database import Connection, IntegrityError
from typing import Any

DAY = 24 * 60 * 60
SNOOZE_DAYS = 7
DEFAULT_CODE = "WIRINGPLUS"
DEFAULT_DAYS = 90
REFERRAL_DAYS = 30
BETA_PLUS_GIFT_DAYS = 365
BETA_PLUS_GIFT_MIGRATION = "beta_plus_gift_existing_users_2026_09"


def is_premium(row: Any, now: float | None = None) -> bool:
    if row is None:
        return False
    keys = set(row.keys()) if hasattr(row, "keys") else set()
    if "premium_until" not in keys and not isinstance(row, dict):
        return False
    until = int((row["premium_until"] if hasattr(row, "keys") else row.get("premium_until")) or 0)
    return until > int(now if now is not None else time.time())


def plus_until(row: Any) -> int:
    if row is None:
        return 0
    keys = set(row.keys()) if hasattr(row, "keys") else set()
    if "premium_until" not in keys and not isinstance(row, dict):
        return 0
    return int((row["premium_until"] if hasattr(row, "keys") else row.get("premium_until")) or 0)


def grant_premium(conn: Connection, uid: int, days: int) -> int:
    if days <= 0:
        conn.execute("UPDATE users SET premium_until = 0, incognito = 0, paused = 0 WHERE id = ?", (uid,))
        return 0
    row = conn.execute("SELECT premium_until FROM users WHERE id = ?", (uid,)).fetchone()
    if not row:
        return 0
    now = int(time.time())
    base = max(now, int(row["premium_until"] or 0))
    until = base + int(days) * DAY
    conn.execute("UPDATE users SET premium_until = ? WHERE id = ?", (until, uid))
    return until


def ensure_default_code(conn: Connection) -> None:
    if conn.execute("SELECT 1 FROM promo_codes LIMIT 1").fetchone():
        return
    conn.execute(
        "INSERT INTO promo_codes (code, days, max_uses, uses) VALUES (?, ?, 0, 0)",
        (DEFAULT_CODE, DEFAULT_DAYS),
    )


def ensure_app_migrations(conn: Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_migrations (
            id TEXT PRIMARY KEY,
            applied_at INTEGER NOT NULL
        )
        """
    )


def ensure_beta_plus_gift(conn: Connection) -> int:
    """One-time WIRING+ grant for accounts that existed before this migration."""
    ensure_app_migrations(conn)
    if conn.execute("SELECT 1 FROM app_migrations WHERE id = ?", (BETA_PLUS_GIFT_MIGRATION,)).fetchone():
        return 0
    now = int(time.time())
    granted = 0
    for row in conn.execute(
        """
        SELECT id FROM users
        WHERE COALESCE(deleted_at, 0) = 0
          AND COALESCE(is_seed, 0) = 0
          AND LOWER(email) NOT LIKE '%@wiring.guest'
          AND LOWER(email) != 'demo@wiring.app'
        """
    ):
        grant_premium(conn, int(row["id"]), BETA_PLUS_GIFT_DAYS)
        granted += 1
    conn.execute(
        "INSERT INTO app_migrations (id, applied_at) VALUES (?, ?)",
        (BETA_PLUS_GIFT_MIGRATION, now),
    )
    return granted


def list_codes(conn: Connection) -> list[dict[str, Any]]:
    return [
        {"code": row["code"], "days": row["days"], "max_uses": row["max_uses"], "uses": row["uses"]}
        for row in conn.execute("SELECT code, days, max_uses, uses FROM promo_codes ORDER BY code")
    ]


def add_code(conn: Connection, code: str, days: int, max_uses: int = 0) -> str | None:
    clean = "".join(ch for ch in (code or "").upper() if ch.isalnum() or ch in "-_")
    if not (4 <= len(clean) <= 24):
        return "код: 4–24 символа"
    if days < 1 or days > 36500:
        return "дни: 1–36500"
    if max_uses < 0:
        return "лимит использований не может быть меньше 0"
    try:
        conn.execute(
            "INSERT INTO promo_codes (code, days, max_uses, uses) VALUES (?, ?, ?, 0)",
            (clean, days, max_uses),
        )
    except IntegrityError:
        return "такой код уже есть"
    return None


def normalize_ref(raw: str) -> str:
    return "".join(ch for ch in (raw or "").lower() if ch.isalnum())[:16]


def ensure_referral_code(conn: Connection, uid: int) -> str:
    row = conn.execute("SELECT referral_code FROM users WHERE id = ?", (uid,)).fetchone()
    if row and row["referral_code"]:
        return str(row["referral_code"])
    for _ in range(8):
        code = secrets.token_hex(4)
        try:
            conn.execute(
                "UPDATE users SET referral_code = ? WHERE id = ? AND (referral_code IS NULL OR referral_code = '')",
                (code, uid),
            )
        except IntegrityError:
            continue
        got = conn.execute("SELECT referral_code FROM users WHERE id = ?", (uid,)).fetchone()
        if got and got["referral_code"]:
            return str(got["referral_code"])
    return ""


def referral_count(conn: Connection, uid: int) -> int:
    return int(conn.execute("SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ?", (uid,)).fetchone()["n"])


def apply_referral(conn: Connection, new_uid: int, raw: str) -> int | None:
    code = normalize_ref(raw)
    if not code:
        return None
    referrer = conn.execute(
        "SELECT id, email, is_seed FROM users WHERE referral_code = ?",
        (code,),
    ).fetchone()
    if not referrer or int(referrer["id"]) == int(new_uid):
        return None
    if int(referrer["is_seed"] or 0):
        return None
    email = str(referrer["email"] or "")
    if email.endswith("@wiring.guest") or email == "demo@wiring.app":
        return None
    if conn.execute("SELECT 1 FROM referrals WHERE referred_id = ?", (new_uid,)).fetchone():
        return None
    try:
        conn.execute(
            "INSERT INTO referrals (referrer_id, referred_id, created_at) VALUES (?, ?, ?)",
            (int(referrer["id"]), int(new_uid), int(time.time())),
        )
    except IntegrityError:
        return None
    grant_premium(conn, int(referrer["id"]), REFERRAL_DAYS)
    grant_premium(conn, int(new_uid), REFERRAL_DAYS)
    return int(referrer["id"])


def redeem_code(conn: Connection, uid: int, raw: str) -> tuple[int | None, str | None]:
    code = "".join(ch for ch in (raw or "").upper() if ch.isalnum() or ch in "-_")
    if not code:
        return None, "нужен код"
    row = conn.execute("SELECT * FROM promo_codes WHERE code = ?", (code,)).fetchone()
    if not row:
        return None, "нет такого кода"
    if row["max_uses"] and int(row["uses"]) >= int(row["max_uses"]):
        return None, "код уже израсходован"
    if conn.execute("SELECT 1 FROM promo_redemptions WHERE code = ? AND user_id = ?", (code, uid)).fetchone():
        return None, "этот код ты уже вводил(а)"
    until = grant_premium(conn, uid, int(row["days"]))
    conn.execute("UPDATE promo_codes SET uses = uses + 1 WHERE code = ?", (code,))
    conn.execute(
        "INSERT INTO promo_redemptions (code, user_id, created_at) VALUES (?, ?, ?)",
        (code, uid, int(time.time())),
    )
    return until, None


def note_for(conn: Connection, uid: int, other_id: int) -> str:
    row = conn.execute(
        "SELECT body FROM notes WHERE user_id = ? AND other_id = ?",
        (uid, other_id),
    ).fetchone()
    return str(row["body"]) if row else ""


def upsert_note(conn: Connection, uid: int, other_id: int, body: str) -> str:
    text = (body or "").strip()[:500]
    if not text:
        conn.execute("DELETE FROM notes WHERE user_id = ? AND other_id = ?", (uid, other_id))
        return ""
    conn.execute(
        """
        INSERT INTO notes (user_id, other_id, body, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, other_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at
        """,
        (uid, other_id, text, int(time.time())),
    )
    return text


def snooze(conn: Connection, uid: int, other_id: int, days: int = SNOOZE_DAYS) -> int:
    until = int(time.time()) + days * DAY
    conn.execute(
        """
        INSERT INTO snoozes (user_id, other_id, until_at, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, other_id) DO UPDATE SET until_at = excluded.until_at, created_at = excluded.created_at
        """,
        (uid, other_id, until, int(time.time())),
    )
    return until


def snoozed_ids(conn: Connection, uid: int) -> set[int]:
    now = int(time.time())
    return {
        int(row["other_id"])
        for row in conn.execute("SELECT other_id FROM snoozes WHERE user_id = ? AND until_at > ?", (uid, now))
    }


def last_snooze(conn: Connection, uid: int):
    return conn.execute(
        "SELECT other_id, created_at FROM snoozes WHERE user_id = ? ORDER BY created_at DESC, other_id DESC LIMIT 1",
        (uid,),
    ).fetchone()


def unsnooze(conn: Connection, uid: int, other_id: int) -> None:
    conn.execute("DELETE FROM snoozes WHERE user_id = ? AND other_id = ?", (uid, other_id))
