"""Voluntary Web Push for likes, matches, and messages.

Subscriptions are stored only after the user turns on the existing push toggle.
VAPID keys come from WEB_PUSH_VAPID_PRIVATE_KEY or are created once in push_vapid.
"""

from __future__ import annotations

import base64
import json
import os
import time
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from database import Connection


def ensure_push_tables(conn: Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            endpoint TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS push_vapid (
            id INTEGER PRIMARY KEY,
            private_pem TEXT NOT NULL,
            public_key TEXT NOT NULL
        )
        """
    )


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _public_key_from_pem(private_pem: str) -> str:
    key = serialization.load_pem_private_key(private_pem.encode("utf-8"), password=None)
    raw = key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    return _b64url(raw)


def _generate_keypair() -> tuple[str, str]:
    private_key = ec.generate_private_key(ec.SECP256R1())
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode("utf-8")
    return private_pem, _public_key_from_pem(private_pem)


def vapid_keys(conn: Connection) -> tuple[str, str]:
    """Return (private PEM, public uncompressed key). Env overrides the stored pair."""
    ensure_push_tables(conn)
    env_private = (os.environ.get("WEB_PUSH_VAPID_PRIVATE_KEY") or "").strip().replace("\\n", "\n")
    if env_private:
        if "BEGIN" not in env_private:
            raise ValueError("WEB_PUSH_VAPID_PRIVATE_KEY must be a PEM private key")
        return env_private, _public_key_from_pem(env_private)
    row = conn.execute("SELECT private_pem, public_key FROM push_vapid WHERE id = 1").fetchone()
    if row:
        return str(row["private_pem"]), str(row["public_key"])
    private_pem, public_key = _generate_keypair()
    conn.execute(
        "INSERT INTO push_vapid (id, private_pem, public_key) VALUES (1, ?, ?)",
        (private_pem, public_key),
    )
    conn.commit()
    return private_pem, public_key


def public_key(conn: Connection) -> str:
    return vapid_keys(conn)[1]


def save_subscription(conn: Connection, user_id: int, subscription: dict[str, Any]) -> None:
    endpoint = str(subscription.get("endpoint") or "").strip()
    keys = subscription.get("keys") or {}
    p256dh = str(keys.get("p256dh") or "").strip()
    auth = str(keys.get("auth") or "").strip()
    if not endpoint or not p256dh or not auth or len(endpoint) > 2000:
        raise ValueError("неполная подписка")
    ensure_push_tables(conn)
    conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
    conn.execute(
        """
        INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (endpoint, user_id, p256dh, auth, int(time.time())),
    )


def delete_subscription(conn: Connection, user_id: int, endpoint: str) -> None:
    endpoint = (endpoint or "").strip()
    if not endpoint:
        return
    conn.execute(
        "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
        (user_id, endpoint),
    )


def delete_user_subscriptions(conn: Connection, user_id: int) -> None:
    ensure_push_tables(conn)
    conn.execute("DELETE FROM push_subscriptions WHERE user_id = ?", (user_id,))


def push_target(kind: str, from_id: int) -> str:
    if kind == "like":
        return "/likes"
    if kind in {"message", "match"} and from_id:
        return f"/chats/{int(from_id)}"
    if kind == "match":
        return "/chats"
    return "/"


def _push_allowed(conn: Connection, user_id: int) -> bool:
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return False
    keys = set(row.keys())
    if "notify_enabled" in keys and not int(row["notify_enabled"] or 0):
        return False
    if "notify_push" in keys and not int(row["notify_push"] or 0):
        return False
    return True


def send_user_push(
    conn: Connection,
    user_id: int,
    *,
    body: str,
    url: str,
    tag: str,
    last_seen: int = 0,
) -> None:
    """Deliver a push when the site is not being polled. Failures stay local."""
    if last_seen and time.time() - int(last_seen) < 120:
        return
    if not _push_allowed(conn, user_id):
        return
    ensure_push_tables(conn)
    rows = conn.execute(
        "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
        (user_id,),
    ).fetchall()
    if not rows:
        return
    try:
        private_pem, _public = vapid_keys(conn)
    except (ValueError, OSError):
        return
    subject = (os.environ.get("WEB_PUSH_VAPID_SUBJECT") or "mailto:noreply@wiring.date").strip()
    payload = json.dumps(
        {"title": "WIRING", "body": body[:180], "url": url, "tag": tag[:80]},
        ensure_ascii=False,
    )
    gone: list[str] = []
    for row in rows:
        status = _deliver(
            {
                "endpoint": row["endpoint"],
                "keys": {"p256dh": row["p256dh"], "auth": row["auth"]},
            },
            payload,
            private_pem,
            subject,
        )
        if status == "gone":
            gone.append(str(row["endpoint"]))
    if gone:
        marks = ",".join("?" * len(gone))
        conn.execute(
            f"DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint IN ({marks})",
            (user_id, *gone),
        )


def _deliver(subscription: dict[str, Any], payload: str, private_pem: str, subject: str) -> str:
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        return "skip"
    try:
        webpush(
            subscription_info=subscription,
            data=payload,
            vapid_private_key=private_pem,
            vapid_claims={"sub": subject},
            ttl=60 * 60 * 12,
        )
        return "ok"
    except WebPushException as exc:
        response = getattr(exc, "response", None)
        code = getattr(response, "status_code", None)
        if code in {404, 410}:
            return "gone"
        return "fail"
    except (OSError, ValueError):
        return "fail"
