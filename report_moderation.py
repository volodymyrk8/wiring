"""Auto-restrict accounts after multiple user reports."""

from __future__ import annotations

import time

from database import Connection

REPORT_BAN_THRESHOLD = 2

REPORT_BAN_USER_MESSAGE = (
    "Аккаунт скрыт после жалоб от двух разных участников. "
    "Если считаешь, что это ошибка, напиши в поддержку — разберём вручную."
)


def is_report_banned(row) -> bool:
    if not row:
        return False
    keys = row.keys() if hasattr(row, "keys") else ()
    if "report_banned_at" not in keys:
        return False
    return bool(row["report_banned_at"])


def report_count_against(conn: Connection, user_id: int) -> int:
    """Total report rows (may include repeat submissions)."""
    row = conn.execute("SELECT COUNT(*) AS n FROM reports WHERE to_id = ?", (user_id,)).fetchone()
    return int(row["n"] or 0)


def report_reporter_count_against(conn: Connection, user_id: int) -> int:
    """Distinct users who filed at least one report against this account."""
    row = conn.execute(
        "SELECT COUNT(DISTINCT from_id) AS n FROM reports WHERE to_id = ?",
        (user_id,),
    ).fetchone()
    return int(row["n"] or 0)


def apply_report_ban_if_needed(conn: Connection, user_id: int) -> bool:
    """Hide the profile when report count reaches the threshold. Returns True if newly banned."""
    row = conn.execute(
        "SELECT is_seed, report_banned_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if not row or is_report_banned(row):
        return False
    if int(row["is_seed"] or 0):
        return False
    if report_reporter_count_against(conn, user_id) < REPORT_BAN_THRESHOLD:
        return False
    conn.execute(
        "UPDATE users SET report_banned_at = ? WHERE id = ? AND report_banned_at IS NULL",
        (int(time.time()), user_id),
    )
    check = conn.execute("SELECT report_banned_at FROM users WHERE id = ?", (user_id,)).fetchone()
    return bool(check and check["report_banned_at"])


def clear_report_ban(conn: Connection, user_id: int) -> bool:
    conn.execute("UPDATE users SET report_banned_at = NULL WHERE id = ?", (user_id,))
    row = conn.execute("SELECT report_banned_at FROM users WHERE id = ?", (user_id,)).fetchone()
    return not bool(row and row["report_banned_at"])
