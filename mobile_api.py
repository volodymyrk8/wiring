"""Token authentication, app-version gate and native push for the mobile apps.

The web app keeps its cookie session. Mobile clients send ``Authorization: Bearer <access>``;
``install`` maps a valid token onto ``session["uid"]`` for the current request only, so every
existing ``@login_required`` endpoint works unchanged and no Set-Cookie is emitted.

Access tokens are short-lived signed values bound to the account's password hash, so a password
change or reset invalidates them. Refresh tokens are opaque, stored hashed, rotated on every use,
and a replayed (already used) refresh token revokes its whole family.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.request
from typing import Any, Callable

from flask import Flask, g, jsonify, request, session
from itsdangerous import BadData, URLSafeTimedSerializer

from database import Connection

ACCESS_TTL = 60 * 60
REFRESH_TTL = 60 * 60 * 24 * 90
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_EXPO_TOKEN_RE = re.compile(r"^Expo(nent)?PushToken\[[A-Za-z0-9_\-]{8,}\]$")
_PLATFORMS = {"ios", "android"}


def ensure_mobile_tables(conn: Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            family TEXT NOT NULL,
            pw TEXT NOT NULL,
            device TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            used_at INTEGER,
            revoked_at INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_mobile_refresh_user ON mobile_refresh_tokens(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_mobile_refresh_family ON mobile_refresh_tokens(family)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS mobile_devices (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            platform TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_mobile_devices_user ON mobile_devices(user_id)")


def _pw_fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _version_tuple(value: str) -> tuple[int, ...]:
    parts = re.findall(r"\d+", value or "")
    return tuple(int(p) for p in parts[:4]) or (0,)


def version_too_old(client: str, minimum: str) -> bool:
    return _version_tuple(client) < _version_tuple(minimum)


def _error(message: str, status: int, **extra: Any):
    return jsonify({"ok": False, "error": message, **extra}), status


def install(
    app: Flask,
    *,
    db: Callable[[], Connection],
    authenticate: Callable[[str, str], tuple[Any, Any]],
    current_user: Callable[[], dict[str, Any] | None],
    too_many: Callable[[str, int, float], bool],
) -> None:
    """Register hooks and routes. ``authenticate`` returns ``(user_row, error_response)``."""

    serializer = URLSafeTimedSerializer(app.secret_key, salt="wiring-mobile-access")

    def issue_access(user_id: int, password_hash: str) -> str:
        return serializer.dumps({"uid": int(user_id), "pw": _pw_fingerprint(password_hash)})

    def issue_refresh(conn: Connection, user_id: int, password_hash: str, family: str, device: str) -> str:
        token = secrets.token_urlsafe(48)
        now = int(time.time())
        conn.execute(
            """
            INSERT INTO mobile_refresh_tokens (token_hash, user_id, family, pw, device, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (_hash_token(token), user_id, family, _pw_fingerprint(password_hash), device[:80], now, now + REFRESH_TTL),
        )
        return token

    def user_for_token(token: str):
        try:
            data = serializer.loads(token, max_age=ACCESS_TTL)
        except BadData:
            return None
        row = db().execute("SELECT * FROM users WHERE id = ?", (int(data.get("uid") or 0),)).fetchone()
        if not row or ("deleted_at" in row.keys() and row["deleted_at"]):
            return None
        if data.get("pw") != _pw_fingerprint(str(row["password_hash"])):
            return None
        return row

    @app.before_request
    def _mobile_gate():
        if not request.path.startswith("/api/"):
            return None
        minimum = (os.environ.get("MOBILE_MIN_VERSION") or "").strip()
        client_version = request.headers.get("X-App-Version", "")
        if minimum and client_version and version_too_old(client_version, minimum):
            return _error(
                "версия приложения устарела — обнови WIRING",
                426,
                upgrade=True,
                min_version=minimum,
            )
        header = request.headers.get("Authorization", "")
        if request.path.startswith("/api/auth/") or not header.lower().startswith("bearer "):
            return None
        row = user_for_token(header[7:].strip())
        if row is None:
            return _error("токен недействителен", 401, token_expired=True)
        session.permanent = False
        session["uid"] = int(row["id"])
        # Request-scoped only: never persist a cookie for token clients.
        session.modified = False
        g.bearer_auth = True
        return None

    def _login_payload(conn: Connection, row: Any, family: str, device: str) -> dict[str, Any]:
        return {
            "ok": True,
            "access_token": issue_access(int(row["id"]), str(row["password_hash"])),
            "refresh_token": issue_refresh(conn, int(row["id"]), str(row["password_hash"]), family, device),
            "expires_in": ACCESS_TTL,
        }

    @app.post("/api/auth/token")
    def api_auth_token():
        ip = request.headers.get("X-Forwarded-For", request.remote_addr or "x").split(",")[0].strip()
        if too_many(f"login:{ip}", 20, 300):
            return _error("слишком много попыток", 429)
        data = request.get_json(silent=True) or {}
        email = str(data.get("email") or "").strip().lower()
        password = str(data.get("password") or "")
        row, err = authenticate(email, password)
        if err is not None:
            return err
        conn = db()
        payload = _login_payload(conn, row, secrets.token_hex(12), str(data.get("device") or ""))
        conn.commit()
        session.permanent = False
        session["uid"] = int(row["id"])
        session.modified = False
        payload["user"] = current_user()
        if g.get("account_restored"):
            payload["restored"] = True
        return jsonify(payload)

    @app.post("/api/auth/refresh")
    def api_auth_refresh():
        data = request.get_json(silent=True) or {}
        token = str(data.get("refresh_token") or "")
        conn = db()
        found = conn.execute(
            "SELECT * FROM mobile_refresh_tokens WHERE token_hash = ?", (_hash_token(token),)
        ).fetchone()
        now = int(time.time())
        if not found:
            return _error("сессия недействительна", 401, token_expired=True)
        if found["used_at"] or found["revoked_at"]:
            # Replay of a rotated token: assume theft and kill the whole family.
            conn.execute(
                "UPDATE mobile_refresh_tokens SET revoked_at = ? WHERE family = ? AND revoked_at IS NULL",
                (now, found["family"]),
            )
            conn.commit()
            return _error("сессия недействительна", 401, token_expired=True)
        user = conn.execute("SELECT * FROM users WHERE id = ?", (found["user_id"],)).fetchone()
        gone = not user or ("deleted_at" in user.keys() and user["deleted_at"])
        if found["expires_at"] < now or gone or found["pw"] != _pw_fingerprint(str(user["password_hash"])):
            conn.execute(
                "UPDATE mobile_refresh_tokens SET revoked_at = ? WHERE family = ? AND revoked_at IS NULL",
                (now, found["family"]),
            )
            conn.commit()
            return _error("сессия недействительна", 401, token_expired=True)
        # Claim the refresh atomically. Two requests can both read the unused row
        # above; only one may rotate it under PostgreSQL's concurrent row locking.
        claimed = conn.execute(
            """
            UPDATE mobile_refresh_tokens SET used_at = ?
            WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL
            """,
            (now, found["token_hash"]),
        )
        if claimed.rowcount != 1:
            conn.execute(
                "UPDATE mobile_refresh_tokens SET revoked_at = ? WHERE family = ? AND revoked_at IS NULL",
                (now, found["family"]),
            )
            conn.commit()
            return _error("сессия недействительна", 401, token_expired=True)
        payload = _login_payload(conn, user, str(found["family"]), str(found["device"] or ""))
        conn.commit()
        return jsonify(payload)

    @app.post("/api/auth/logout")
    def api_auth_logout():
        data = request.get_json(silent=True) or {}
        conn = db()
        now = int(time.time())
        token = str(data.get("refresh_token") or "")
        if token:
            found = conn.execute(
                "SELECT family, user_id FROM mobile_refresh_tokens WHERE token_hash = ?", (_hash_token(token),)
            ).fetchone()
            if found:
                conn.execute(
                    "UPDATE mobile_refresh_tokens SET revoked_at = ? WHERE family = ? AND revoked_at IS NULL",
                    (now, found["family"]),
                )
                push_token = str(data.get("push_token") or "")
                if push_token:
                    conn.execute(
                        "DELETE FROM mobile_devices WHERE token = ? AND user_id = ?", (push_token, found["user_id"])
                    )
        conn.commit()
        return jsonify({"ok": True})

    @app.get("/api/app-config")
    def api_app_config():
        return jsonify(
            {
                "ok": True,
                "min_version": (os.environ.get("MOBILE_MIN_VERSION") or "").strip(),
                "latest_version": (os.environ.get("MOBILE_LATEST_VERSION") or "").strip(),
            }
        )

    @app.post("/api/push/device")
    def api_push_device_register():
        uid = session.get("uid")
        if not uid:
            return _error("нужна сессия", 401)
        data = request.get_json(silent=True) or {}
        token = str(data.get("token") or "").strip()
        platform = str(data.get("platform") or "").strip().lower()
        if not _EXPO_TOKEN_RE.match(token):
            return _error("неверный push-токен", 400)
        if platform not in _PLATFORMS:
            return _error("platform: ios или android", 400)
        conn = db()
        row = conn.execute("SELECT notify_enabled, notify_push FROM users WHERE id = ?", (uid,)).fetchone()
        if not row or not int(row["notify_enabled"] or 0) or not int(row["notify_push"] or 0):
            return _error("сначала включи пуш в уведомлениях", 403)
        now = int(time.time())
        conn.execute(
            """
            INSERT INTO mobile_devices (token, user_id, platform, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform,
                updated_at = excluded.updated_at
            """,
            (token, uid, platform, now, now),
        )
        conn.commit()
        return jsonify({"ok": True})

    @app.delete("/api/push/device")
    def api_push_device_delete():
        uid = session.get("uid")
        if not uid:
            return _error("нужна сессия", 401)
        data = request.get_json(silent=True) or {}
        conn = db()
        conn.execute(
            "DELETE FROM mobile_devices WHERE token = ? AND user_id = ?", (str(data.get("token") or ""), uid)
        )
        conn.commit()
        return jsonify({"ok": True})


def delete_user_devices(conn: Connection, user_id: int) -> None:
    conn.execute("DELETE FROM mobile_devices WHERE user_id = ?", (user_id,))


def send_device_push(conn: Connection, user_id: int, *, body: str, url: str, tag: str) -> None:
    """Send through the Expo push service. Failures stay local, like the web push path."""
    rows = conn.execute("SELECT token FROM mobile_devices WHERE user_id = ?", (user_id,)).fetchall()
    if not rows:
        return
    messages = [
        {
            "to": row["token"],
            "title": "WIRING",
            "body": body[:180],
            "sound": "default",
            "data": {"url": url, "tag": tag[:80]},
            "channelId": "default",
        }
        for row in rows
    ]
    request_ = urllib.request.Request(
        EXPO_PUSH_URL,
        data=json.dumps(messages).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request_, timeout=5) as response:  # noqa: S310 - fixed https URL
            result = json.loads(response.read().decode() or "{}")
    except (urllib.error.URLError, OSError, ValueError):
        return
    dead = [
        message["to"]
        for message, ticket in zip(messages, result.get("data") or [])
        if isinstance(ticket, dict)
        and ticket.get("status") == "error"
        and (ticket.get("details") or {}).get("error") == "DeviceNotRegistered"
    ]
    for token in dead:
        conn.execute("DELETE FROM mobile_devices WHERE token = ?", (token,))
