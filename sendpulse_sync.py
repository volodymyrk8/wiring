"""Add consenting, verified WIRING accounts to SendPulse outside HTTP requests."""
from __future__ import annotations

import hashlib
import json
import os
import shlex
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, Request, build_opener


class SendPulseError(Exception):
    """Safe to log: never includes credentials, addresses or response bodies."""

    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class Config:
    api_key: str = field(repr=False)
    addressbook_id: int


def load_config(env_file=None):
    keys = ("SENDPULSE_API_KEY", "SENDPULSE_ADDRESSBOOK_ID")
    values = {}
    path = Path(env_file) if env_file is not None else Path(__file__).with_name(".env")
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            name, sep, value = line.strip().removeprefix("export ").partition("=")
            name = name.strip()
            if sep and name in keys and name not in os.environ:
                try:
                    parts = shlex.split(value, comments=True)
                except ValueError:
                    raise SendPulseError(f"Invalid .env value for {name}") from None
                if len(parts) > 1:
                    raise SendPulseError(f"Invalid .env value for {name}")
                values[name] = parts[0] if parts else ""
    for name in keys:
        if name in os.environ:
            values[name] = os.environ[name].strip()
    key = values.get(keys[0], "")
    book = values.get(keys[1], "")
    if not key and not book:
        return None
    if not key or any(c.isspace() for c in key):
        raise SendPulseError("SENDPULSE_API_KEY must be a nonempty API key without whitespace")
    if not book.isascii() or not book.isdigit() or int(book) <= 0:
        raise SendPulseError("SENDPULSE_ADDRESSBOOK_ID must be a positive integer")
    return Config(key, int(book))


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Client:
    def __init__(self, config):
        self.config = config
        self.opener = build_opener(_NoRedirect())
        self.next_request_at = 0.0

    def request(self, path, payload=None, *, missing_ok=False):
        delay = self.next_request_at - time.monotonic()
        if delay > 0:
            time.sleep(delay)
        self.next_request_at = time.monotonic() + 0.15
        req = Request(
            "https://api.sendpulse.com/" + path,
            data=None if payload is None else json.dumps(payload).encode("utf-8"),
            headers={"Authorization": "Bearer " + self.config.api_key,
                     "Content-Type": "application/json", "Accept": "application/json"},
            method="GET" if payload is None else "POST",
        )
        try:
            with self.opener.open(req, timeout=10) as response:
                result = json.load(response)
        except HTTPError as exc:
            status = exc.code
            try:
                error = json.loads(exc.read(65536))
            except (ValueError, OSError):
                error = {}
            exc.close()
            if missing_ok and (status == 404 or (status == 400 and self._missing_contact(error))):
                return None
            raise SendPulseError(f"SendPulse HTTP {status}", status) from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise SendPulseError("SendPulse unavailable or invalid JSON response") from None
        if missing_ok and self._missing_contact(result):
            return None
        if isinstance(result, dict) and (result.get("result") is False or "error" in result or "error_code" in result):
            raise SendPulseError("SendPulse rejected the request")
        return result

    @staticmethod
    def _missing_contact(result):
        return isinstance(result, dict) and str(result.get("error_code")) in ("17", "303", "502")

    def validate(self):
        result = self.request(f"addressbooks/{self.config.addressbook_id}")
        if isinstance(result, list) and len(result) == 1:
            result = result[0]
        if not isinstance(result, dict) or str(result.get("id")) != str(self.config.addressbook_id):
            raise SendPulseError("SendPulse returned an unexpected address book")
        if result.get("status") not in (0, "0"):
            raise SendPulseError("SendPulse address book is not active")
        return result

    def exists(self, email):
        result = self.request(
            f"addressbooks/{self.config.addressbook_id}/emails/{quote(email, safe='')}", missing_ok=True,
        )
        if result is None:
            return False
        if isinstance(result, dict) and str(result.get("email", "")).lower() == email.lower():
            # All statuses, including unsubscribed/blocked/deleted, are left untouched.
            return True
        raise SendPulseError("SendPulse returned an unexpected contact response")

    def add(self, email, name):
        result = self.request(f"addressbooks/{self.config.addressbook_id}/emails", {
            "emails": [{"email": email, "variables": {"name": name}}],
        })
        if not isinstance(result, dict) or result.get("result") is not True:
            raise SendPulseError("SendPulse did not confirm the contact import")


def ensure_sync_table(conn):
    # IF NOT EXISTS alone can race in PostgreSQL's type catalog on first boot.
    # Hold this transaction lock until the caller commits the migration.
    conn.execute("SELECT pg_advisory_xact_lock(739201, 2)")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sendpulse_contacts (
            addressbook_id BIGINT NOT NULL,
            email_key TEXT NOT NULL,
            user_id BIGINT NOT NULL,
            synced_at BIGINT,
            attempts INTEGER NOT NULL DEFAULT 0,
            retry_at BIGINT NOT NULL DEFAULT 0,
            PRIMARY KEY (addressbook_id, email_key)
        )
    """)


def sync_contacts(conn, client, *, now=None, limit=25):
    """Durable receipts/backoff and a session lock; callers own/close the connection."""
    now = int(time.time()) if now is None else now
    book = client.config.addressbook_id
    locked = conn.execute("SELECT pg_try_advisory_lock(739201, 1) AS locked").fetchone()["locked"]
    conn.commit()
    if not locked:
        return {"added": 0, "existing": 0, "failed": 0, "busy": True}
    stats = {"added": 0, "existing": 0, "failed": 0, "busy": False}
    try:
        ensure_sync_table(conn)
        conn.commit()
        # Hashes avoid duplicating email addresses in the sync ledger.
        rows = conn.execute("""
            SELECT u.id, LOWER(TRIM(u.email)) AS email, u.name,
                   COALESCE(s.attempts, 0) AS attempts
            FROM users u
            LEFT JOIN sendpulse_contacts s ON s.addressbook_id = ?
                AND s.email_key = encode(sha256(convert_to(LOWER(TRIM(u.email)), 'UTF8')), 'hex')
            WHERE u.deleted_at IS NULL AND COALESCE(u.is_seed, 0) = 0
                AND u.marketing_consent_at > 0 AND u.email_verified_at > 0
                AND u.email LIKE '%@%'
                AND LOWER(u.email) NOT LIKE '%@wiring.guest'
                AND LOWER(u.email) NOT LIKE '%@wiring.demo'
                AND LOWER(u.email) NOT LIKE '%@wiring.test'
                AND LOWER(u.email) NOT LIKE '%@deleted.wiring'
                AND LOWER(u.email) <> 'demo@wiring.app'
                AND s.synced_at IS NULL AND COALESCE(s.retry_at, 0) <= ?
            ORDER BY u.id LIMIT ?
        """, (book, now, limit)).fetchall()
        conn.commit()
        if rows:
            client.validate()
        for row in rows:
            email = row["email"]
            email_key = hashlib.sha256(email.encode("utf-8")).hexdigest()
            # Recheck eligibility immediately before contacting the provider.
            eligible = conn.execute("""
                SELECT name FROM users WHERE id = ? AND deleted_at IS NULL
                    AND marketing_consent_at > 0 AND email_verified_at > 0
                    AND LOWER(TRIM(email)) = ? AND COALESCE(is_seed, 0) = 0
            """, (row["id"], email)).fetchone()
            conn.commit()
            if not eligible:
                continue
            try:
                existing = client.exists(email)
                if not existing:
                    client.add(email, eligible["name"])
            except SendPulseError as exc:
                if exc.status in (401, 403):
                    raise
                attempts = int(row["attempts"]) + 1
                conn.execute("""
                    INSERT INTO sendpulse_contacts (addressbook_id, email_key, user_id, attempts, retry_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT (addressbook_id, email_key) DO UPDATE
                    SET attempts = excluded.attempts, retry_at = excluded.retry_at
                """, (book, email_key, row["id"], attempts, now + min(3600, 300 * 2 ** min(attempts - 1, 4))))
                conn.commit()
                stats["failed"] += 1
                continue
            conn.execute("""
                INSERT INTO sendpulse_contacts (addressbook_id, email_key, user_id, synced_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (addressbook_id, email_key) DO UPDATE
                SET synced_at = excluded.synced_at, attempts = 0, retry_at = 0
            """, (book, email_key, row["id"], now))
            conn.commit()
            stats["existing" if existing else "added"] += 1
        return stats
    finally:
        conn.rollback()
        conn.execute("SELECT pg_advisory_unlock(739201, 1)")
        conn.commit()
