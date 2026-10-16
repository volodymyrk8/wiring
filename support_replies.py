"""Moderator responses to profile reports and support requests; one shared channel."""
from __future__ import annotations

import re
import time
from collections.abc import Callable
from typing import Any
from database import Connection
from notify import add_notice


def ensure_reply_tables(conn: Connection) -> None:
    conn.execute("""CREATE TABLE IF NOT EXISTS support_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('report', 'ticket')),
        source_id INTEGER NOT NULL,
        user_id INTEGER,
        email TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        request_id TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        email_attempted_at INTEGER,
        email_sent_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_support_replies_user ON support_replies(user_id, id)")


def reply_recipient(conn: Connection, kind: str, source_id: int) -> dict[str, Any] | None:
    # Lock the source to serialize double submissions and retries for this request.
    if kind == "report":
        source = conn.execute("SELECT from_id AS user_id, '' AS email FROM reports WHERE id = ? FOR UPDATE", (source_id,)).fetchone()
    elif kind == "ticket":
        source = conn.execute("SELECT user_id, email FROM support_tickets WHERE id = ? FOR UPDATE", (source_id,)).fetchone()
    else:
        return None
    if not source:
        return None
    user = conn.execute("SELECT id, email FROM users WHERE id = ? AND COALESCE(deleted_at, 0) = 0", (source["user_id"],)).fetchone() if source["user_id"] else None
    email = str(source["email"] or (user["email"] if user else "") or "").strip()
    if "@wiring.guest" in email or email in {"demo@wiring.app"} or email.endswith("@wiring.demo"):
        email = ""
    return {"user_id": user["id"] if user else None, "email": email}


def save_reply(conn: Connection, kind: str, source_id: int, body: object, request_id: object,
               send_mail: Callable[[str, str, str], bool], site_url: str) -> int:
    body = str(body or "").strip()
    if not 1 <= len(body) <= 2000:
        raise ValueError("Ответ должен содержать от 1 до 2000 символов")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,80}", str(request_id or "")):
        raise ValueError("Обнови страницу и повтори отправку")
    recipient = reply_recipient(conn, kind, source_id)
    if recipient is None:
        raise LookupError("Обращение не найдено")
    if not recipient["user_id"] and not recipient["email"]:
        raise ValueError("У обращения нет аккаунта или почты для ответа")
    existing = conn.execute("SELECT * FROM support_replies WHERE request_id = ?", (request_id,)).fetchone()
    if existing and (existing["source_kind"] != kind or existing["source_id"] != source_id or existing["body"] != body):
        raise ValueError("Этот запрос уже использован для другого ответа; обнови страницу")
    now = int(time.time())
    if existing:
        reply_id = existing["id"]
        if existing["email_sent_at"] or not existing["email"]:
            return reply_id
        email = str(existing["email"])
    else:
        inserted = conn.execute("""INSERT INTO support_replies
            (source_kind, source_id, user_id, email, body, request_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id""", (kind, source_id, recipient["user_id"], recipient["email"], body, request_id, now))
        reply_id = inserted.lastrowid
        email = recipient["email"]
        if recipient["user_id"]:
            add_notice(conn, recipient["user_id"], "support", 0, "Поддержка ответила на твоё обращение. Ответ — в разделе «Поддержка».")
    if email:
        try:
            sent = send_mail(email, "Ответ поддержки WIRING", f"{body}\n\nПоддержка: {site_url}/support")
        except Exception:
            sent = False
        conn.execute("UPDATE support_replies SET email_attempted_at = ?, email_sent_at = ? WHERE id = ?", (now, now if sent else None, reply_id))
    return reply_id


def admin_reply_history(conn: Connection) -> dict[str, dict[int, list[dict[str, Any]]]]:
    result = {"report": {}, "ticket": {}}
    for row in conn.execute("SELECT * FROM support_replies ORDER BY id DESC LIMIT 400").fetchall():
        result[row["source_kind"]].setdefault(row["source_id"], []).append(dict(row))
    return result


def user_replies(conn: Connection, user_id: int) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute("SELECT id, source_kind, body, created_at FROM support_replies WHERE user_id = ? ORDER BY id DESC LIMIT 40", (user_id,)).fetchall()]


def purge_user_replies(conn: Connection, user_id: int) -> None:
    # Include replies sent to an explicit ticket email after the account was hidden.
    conn.execute("""DELETE FROM support_replies WHERE user_id = ?
        OR (source_kind = 'report' AND source_id IN (SELECT id FROM reports WHERE from_id = ? OR to_id = ?))
        OR (source_kind = 'ticket' AND source_id IN (SELECT id FROM support_tickets WHERE user_id = ?))""",
        (user_id, user_id, user_id, user_id))
