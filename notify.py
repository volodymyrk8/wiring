"""Outbound like/match pings. Email if configured; Telegram admin optional."""

from __future__ import annotations

import json
import os
import smtplib
import time

from database import Connection
import urllib.error
import urllib.request
from email.message import EmailMessage
from typing import Any


def add_notice(conn: Connection, user_id: int, kind: str, from_id: int, body: str) -> None:
    conn.execute(
        "INSERT INTO notifications (user_id, kind, from_id, body, created_at, read) VALUES (?, ?, ?, ?, ?, 0)",
        (user_id, kind, from_id, body[:280], int(time.time())),
    )


def unread_notices(conn: Connection, user_id: int, limit: int = 8) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, kind, from_id, body, created_at
        FROM notifications
        WHERE user_id = ? AND read = 0
        ORDER BY id DESC LIMIT ?
        """,
        (user_id, limit),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "kind": row["kind"],
            "from_id": row["from_id"],
            "body": row["body"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def mark_notices_read(conn: Connection, user_id: int, ids: list[int] | None = None) -> None:
    if ids:
        clean = [int(item) for item in ids if str(item).isdigit() or isinstance(item, int)]
        if not clean:
            return
        marks = ",".join("?" * len(clean))
        conn.execute(
            f"UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN ({marks})",
            (user_id, *clean),
        )
        return
    conn.execute("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0", (user_id,))


def _send_email(to_addr: str, subject: str, body: str) -> bool:
    if not to_addr or "@wiring.guest" in to_addr or to_addr.endswith("@wiring.demo"):
        return False
    resend = (os.environ.get("RESEND_API_KEY") or "").strip()
    mail_from = os.environ.get("MAIL_FROM", "WIRING <noreply@wiring.date>")
    if resend:
        payload = {"from": mail_from, "to": [to_addr], "subject": subject, "text": body}
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {resend}",
                "Content-Type": "application/json",
                "User-Agent": "wiring-date/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                return 200 <= resp.status < 300
        except urllib.error.HTTPError:
            return False
        except (urllib.error.URLError, TimeoutError, OSError):
            return False
    host = (os.environ.get("SMTP_HOST") or "").strip()
    if not host:
        return False
    port = int(os.environ.get("SMTP_PORT") or "587")
    user = os.environ.get("SMTP_USER") or ""
    password = os.environ.get("SMTP_PASSWORD") or ""
    msg = EmailMessage()
    msg["From"] = mail_from
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(host, port, timeout=8) as smtp:
            smtp.starttls()
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
        return True
    except (OSError, smtplib.SMTPException):
        return False


def _admin_telegram(text: str) -> None:
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    chat = (os.environ.get("TELEGRAM_ADMIN_CHAT") or "").strip()
    if not token or not chat:
        return
    payload = json.dumps({"chat_id": chat, "text": text[:900]}).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=5)
    except (urllib.error.URLError, TimeoutError, OSError):
        return


def send_mail(to_addr: str, subject: str, body: str) -> bool:
    return _send_email(to_addr, subject, body)


def notify_support(subject: str, body: str) -> None:
    inbox = (os.environ.get("SUPPORT_INBOX") or "").strip()
    if inbox:
        _send_email(inbox, subject, body)
    _admin_telegram(f"WIRING support: {body[:400]}")


def notify_event(
    conn: Connection,
    *,
    user_id: int,
    email: str,
    is_guest: bool,
    kind: str,
    from_id: int,
    from_name: str,
    preview: str = "",
    last_seen: int = 0,
) -> None:
    if kind == "like":
        body = f"{from_name} лайкнул(а) тебя"
        subject = "Тебя лайкнули на WIRING"
        mail = f"{from_name} лайкнул(а) твою анкету. Открыть: https://wiring.date/"
    elif kind == "message":
        snippet = " ".join((preview or "").split())
        if len(snippet) > 80:
            snippet = snippet[:79] + "…"
        body = f"{from_name}: {snippet}" if snippet else f"{from_name} написал(а)"
        subject = "Новое сообщение на WIRING"
        mail = f"{from_name} написал(а) тебе. Открыть чат: https://wiring.date/"
        existing = conn.execute(
            "SELECT id FROM notifications WHERE user_id = ? AND kind = 'message' AND from_id = ? AND read = 0",
            (user_id, from_id),
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE notifications SET body = ?, created_at = ? WHERE id = ?",
                (body[:280], int(time.time()), existing["id"]),
            )
            return
    else:
        body = f"взаимно с {from_name}"
        subject = "Мэтч на WIRING"
        mail = f"Взаимно с {from_name}. Можно писать: https://wiring.date/"
    add_notice(conn, user_id, kind, from_id, body)
    mail_on = (os.environ.get("MAIL_USER_NOTIFY") or "").strip().lower() in {"1", "true", "yes"}
    online = bool(last_seen and time.time() - int(last_seen) < 120)
    if mail_on and not is_guest and not online:
        _send_email(email, subject, mail)
    _admin_telegram(f"WIRING {kind}: {from_name} → user {user_id}")
