#!/usr/bin/env python3
"""WIRING — dating for neurodivergent people."""

from __future__ import annotations

import os
import random
import re
import secrets
import shutil
import time
from functools import wraps
from typing import Any

from flask import Flask, abort, g, jsonify, redirect, render_template, request, send_file, send_from_directory, session
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

from admin import collect_stats, ensure_filter_tables, track_filters
from database import (
    Connection,
    Row,
    USE_PG,
    columns as _db_columns,
    connect as db_connect,
    ensure_column as _db_ensure_column,
    open_request_connection,
    table_names as _db_table_names,
)
from feed import claim_feed, ensure_feed_history, exclude_profile, mark_viewed, reset_delivery
from catalog import (
    GENDER_IDS,
    INTENT_IDS,
    LOOKING_IDS,
    NEURO_IDS,
    PROMPT_IDS,
    REPORT_IDS,
    SEED_PHOTOS,
    VIBE_IDS,
    catalog_payload,
)
from cities import PLACES, catalog_city, country_of_city, is_catalog_city, normalize_city
from devices import ensure_device_tables, track_device_visit, visitor_key_from_request
from icebreakers import cached_openers, clear_openers, ensure_opener_table
from jev_ranker import jev_access, prepare_jev_feed
from glossary import glossary_html
from legal_pages import PRIVACY_HTML, RULES_HTML, SUPPORT_HTML
from matchmaker import pack_profile, seed_decides_like
from media import MediaError, make_thumb, read_upload
from moderation import moderate_photo
from notify import add_notice, mark_notices_read, notify_event, notify_support, send_mail, unread_notices
from premium import (
    REFERRAL_DAYS,
    add_code,
    apply_referral,
    ensure_beta_plus_gift,
    ensure_beta_plus_three_months,
    ensure_default_code,
    ensure_referral_code,
    grant_premium,
    is_premium,
    last_snooze,
    list_codes,
    plus_until,
    redeem_code,
    referral_count,
    snooze,
    snoozed_ids,
    unsnooze,
)
from profanity import has_profanity
from support_triage import ensure_task_tables, list_tasks, task_counts, task_threshold, triage_support_tickets

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
BASE_PATH = os.environ.get("BASE_PATH", "").rstrip("/")
HOST = os.environ.get("HOST", "127.0.0.1")
# Fixed local dev port (documented in README; override only for prod/systemd).
DEV_PORT = 5070
PORT = int(os.environ.get("PORT", str(DEV_PORT)))
DATABASE_URL = os.environ.get("DATABASE_URL", "")
DB_PATH = DATABASE_URL
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(BASE_DIR, "data", "uploads"))
THUMB_DIR = os.environ.get("THUMB_DIR", os.path.join(os.path.dirname(UPLOAD_DIR) or BASE_DIR, "thumbs"))
APP_SECRET_KEY = os.environ.get("APP_SECRET_KEY") or secrets.token_hex(32)
SITE_URL = os.environ.get("SITE_URL", "https://wiring.date").rstrip("/")
GOOGLE_ANALYTICS_ID = os.environ.get("GOOGLE_ANALYTICS_ID", "G-WH72XL7E2J").strip()
YANDEX_METRIKA_ID = os.environ.get("YANDEX_METRIKA_ID", "").strip()

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_PHOTOS = 12
MAX_ALBUMS = 8
MAX_PROMPTS = 3
ONLINE_WINDOW = 10 * 60

app = Flask(__name__, template_folder="templates", static_folder=None)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.secret_key = APP_SECRET_KEY
app.config.update(
    SESSION_COOKIE_NAME="wiring_session",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE", "").lower() in {"1", "true", "yes"},
    SESSION_COOKIE_PATH=BASE_PATH or "/",
    PERMANENT_SESSION_LIFETIME=60 * 60 * 24 * 30,
    JSON_AS_ASCII=False,
    MAX_CONTENT_LENGTH=9 * 1024 * 1024,
)


@app.context_processor
def runtime_config() -> dict[str, str]:
    return {"google_analytics_id": GOOGLE_ANALYTICS_ID, "yandex_metrika_id": YANDEX_METRIKA_ID}

_rate: dict[str, list[float]] = {}


def prefix(path: str) -> str:
    if not path.startswith("/"):
        path = "/" + path
    return f"{BASE_PATH}{path}" if BASE_PATH else path


def db() -> Connection:
    conn = getattr(g, "_db", None)
    if conn is None:
        conn = open_request_connection()
        g._db = conn
    return conn


@app.teardown_appcontext
def _close_db(_exc: BaseException | None) -> None:
    conn = getattr(g, "_db", None)
    if conn is not None:
        conn.close()


_DEVICE_SKIP_PREFIXES = ("/public/", "/media/", "/health", "/admin")


@app.before_request
def _log_device_visit() -> None:
    path = request.path or "/"
    if BASE_PATH and path.startswith(BASE_PATH):
        path = path[len(BASE_PATH) :] or "/"
    if any(path.startswith(prefix) for prefix in _DEVICE_SKIP_PREFIXES):
        return
    if request.method == "OPTIONS":
        return
    ua = str(request.headers.get("User-Agent") or "").strip()
    if not ua:
        return
    uid = session.get("uid")
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "x").split(",")[0].strip()
    visitor_key = "" if uid else visitor_key_from_request(ip, ua)
    conn = db()
    if track_device_visit(
        conn,
        user_id=int(uid) if uid else None,
        ua=ua,
        visitor_key=visitor_key,
    ):
        conn.commit()


def _columns(conn: Connection, table: str) -> set[str]:
    return _db_columns(conn, table)


def _ensure_column(conn: Connection, table: str, name: str, ddl: str) -> None:
    _db_ensure_column(conn, table, name, ddl)


def _album_id(conn: Connection, user_id: int, title: str = "я") -> int:
    title = (title or "я").strip()[:32] or "я"
    row = conn.execute(
        "SELECT id FROM albums WHERE user_id = ? AND title = ?",
        (user_id, title),
    ).fetchone()
    if row:
        return int(row["id"])
    count = conn.execute("SELECT COUNT(*) AS n FROM albums WHERE user_id = ?", (user_id,)).fetchone()["n"]
    cur = conn.execute(
        "INSERT INTO albums (user_id, title, sort_order, created_at) VALUES (?, ?, ?, ?)",
        (user_id, title, int(count), int(time.time())),
    )
    return int(cur.lastrowid)


def _sync_primary_photo(conn: Connection, user_id: int) -> None:
    row = conn.execute(
        """
        SELECT path FROM photos
        WHERE user_id = ?
        ORDER BY is_primary DESC, sort_order ASC, id ASC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    conn.execute("UPDATE users SET photo = ? WHERE id = ?", (row["path"] if row else "", user_id))


def _attach_portrait(conn: Connection, user_id: int, photo: str) -> None:
    if not photo or photo not in SEED_PHOTOS:
        return
    if conn.execute("SELECT id FROM photos WHERE user_id = ? AND path = ?", (user_id, photo)).fetchone():
        return
    album_id = _album_id(conn, user_id, "я")
    has_primary = conn.execute(
        "SELECT id FROM photos WHERE user_id = ? AND is_primary = 1",
        (user_id,),
    ).fetchone()
    conn.execute(
        """
        INSERT INTO photos (user_id, album_id, path, is_primary, sort_order, created_at)
        VALUES (?, ?, ?, ?, 0, ?)
        """,
        (user_id, album_id, photo, 0 if has_primary else 1, int(time.time())),
    )
    _sync_primary_photo(conn, user_id)


def _replace_prompts(conn: Connection, user_id: int, prompts: list[dict[str, str]]) -> None:
    conn.execute("DELETE FROM user_prompts WHERE user_id = ?", (user_id,))
    for index, item in enumerate(prompts):
        conn.execute(
            "INSERT INTO user_prompts (user_id, prompt_id, answer, sort_order) VALUES (?, ?, ?, ?)",
            (user_id, item["id"], item["answer"], index),
        )


def init_db() -> None:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    conn = db_connect()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            age INTEGER NOT NULL,
            city TEXT NOT NULL,
            gender TEXT NOT NULL,
            looking_for TEXT NOT NULL,
            bio TEXT NOT NULL DEFAULT '',
            photo TEXT NOT NULL DEFAULT '',
            job TEXT NOT NULL DEFAULT '',
            intent TEXT NOT NULL DEFAULT 'dating',
            height INTEGER,
            communication TEXT NOT NULL DEFAULT '',
            last_seen INTEGER NOT NULL DEFAULT 0,
            is_seed INTEGER NOT NULL DEFAULT 0,
            deleted_at INTEGER DEFAULT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_tags (
            user_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            tag TEXT NOT NULL,
            PRIMARY KEY (user_id, kind, tag),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS user_prompts (
            user_id INTEGER NOT NULL,
            prompt_id TEXT NOT NULL,
            answer TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, prompt_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS albums (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            album_id INTEGER,
            path TEXT NOT NULL,
            is_primary INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS swipes (
            from_id INTEGER NOT NULL,
            to_id INTEGER NOT NULL,
            direction TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (from_id, to_id),
            FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_swipes_to ON swipes(to_id, direction);
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_id INTEGER NOT NULL,
            to_id INTEGER NOT NULL,
            body TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            deleted_at INTEGER DEFAULT NULL,
            FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(from_id, to_id, id);
        CREATE TABLE IF NOT EXISTS blocks (
            from_id INTEGER NOT NULL,
            to_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (from_id, to_id),
            FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_id INTEGER NOT NULL,
            to_id INTEGER NOT NULL,
            reason TEXT NOT NULL,
            details TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS reads (
            user_id INTEGER NOT NULL,
            other_id INTEGER NOT NULL,
            last_read_id INTEGER NOT NULL DEFAULT 0,
            deleted_at INTEGER DEFAULT NULL,
            PRIMARY KEY (user_id, other_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            from_id INTEGER NOT NULL DEFAULT 0,
            body TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            read INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_notices_user ON notifications(user_id, read);
        CREATE TABLE IF NOT EXISTS notes (
            user_id INTEGER NOT NULL,
            other_id INTEGER NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, other_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS snoozes (
            user_id INTEGER NOT NULL,
            other_id INTEGER NOT NULL,
            until_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, other_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS promo_codes (
            code TEXT PRIMARY KEY,
            days INTEGER NOT NULL,
            max_uses INTEGER NOT NULL DEFAULT 0,
            uses INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS promo_redemptions (
            code TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (code, user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS referrals (
            referrer_id INTEGER NOT NULL,
            referred_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (referred_id),
            FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_referrals_from ON referrals(referrer_id);
        CREATE TABLE IF NOT EXISTS support_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            body TEXT NOT NULL,
            ip TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS password_resets (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            used_at INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS email_verifications (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            used_at INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS filter_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            source TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            kind TEXT NOT NULL,
            value TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """
    )
    ensure_feed_history(conn)
    ensure_filter_tables(conn)
    ensure_device_tables(conn)
    ensure_task_tables(conn)
    ensure_opener_table(conn)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_filter_events_kind ON filter_events(kind, value, created_at)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_filter_events_user ON filter_events(user_id, fingerprint, created_at)"
    )
    for name, ddl in {
        "job": "TEXT NOT NULL DEFAULT ''",
        "intent": "TEXT NOT NULL DEFAULT 'dating'",
        "height": "INTEGER",
        "communication": "TEXT NOT NULL DEFAULT ''",
        "last_seen": "INTEGER NOT NULL DEFAULT 0",
        "onboard_done": "INTEGER NOT NULL DEFAULT 0",
        "premium_until": "INTEGER NOT NULL DEFAULT 0",
        "incognito": "INTEGER NOT NULL DEFAULT 0",
        "paused": "INTEGER NOT NULL DEFAULT 0",
        "notify_enabled": "INTEGER NOT NULL DEFAULT 1",
        "notify_push": "INTEGER NOT NULL DEFAULT 1",
        "referral_code": "TEXT",
        "privacy_accepted_at": "INTEGER",
        "special_data_consent_at": "INTEGER",
        "photo_rights_consent_at": "INTEGER",
        "marketing_consent_at": "INTEGER",
        "seek_min_age": "INTEGER NOT NULL DEFAULT 18",
        "seek_max_age": "INTEGER NOT NULL DEFAULT 99",
        "seek_place": "TEXT NOT NULL DEFAULT ''",
        "hide_tags": "TEXT NOT NULL DEFAULT ''",
        "deleted_at": "INTEGER",
        "jev_feed_enabled": "INTEGER NOT NULL DEFAULT 0",
    }.items():
        _ensure_column(conn, "users", name, ddl)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted_at)")
    had_email_verified = "email_verified_at" in _columns(conn, "users")
    _ensure_column(conn, "users", "email_verified_at", "INTEGER")
    if not had_email_verified:
        # Grandfather existing accounts so deploy doesn't lock anyone out.
        now = int(time.time())
        conn.execute(
            """
            UPDATE users
            SET email_verified_at = COALESCE(NULLIF(created_at, 0), ?)
            WHERE email_verified_at IS NULL
            """,
            (now,),
        )
    _ensure_column(conn, "messages", "reply_to_id", "INTEGER")
    _ensure_column(conn, "messages", "photo", "TEXT NOT NULL DEFAULT ''")
    _ensure_column(conn, "messages", "deleted_at", "INTEGER")
    _ensure_column(conn, "reads", "deleted_at", "INTEGER")
    # Map free-text cities onto the catalog when an alias/exact match exists.
    for row in conn.execute("SELECT id, city FROM users"):
        resolved = catalog_city(str(row["city"] or ""))
        if resolved and resolved != row["city"]:
            conn.execute("UPDATE users SET city = ? WHERE id = ?", (resolved, row["id"]))
    conn.execute("UPDATE users SET gender = 'hidden' WHERE gender = 'other'")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral ON users(referral_code)")
    ensure_default_code(conn)
    ensure_beta_plus_gift(conn)
    ensure_beta_plus_three_months(conn)
    from user_tags import ensure_legacy_vibe_cleanup

    ensure_legacy_vibe_cleanup(conn)

    # Fake deck fillers are retired: wipe any leftover seed rows on boot.
    seed_ids = [
        int(row["id"])
        for row in conn.execute(
            """
            SELECT id FROM users
            WHERE COALESCE(is_seed, 0) = 1
               OR email LIKE '%@wiring.demo'
            """
        )
    ]
    has_referrals = "referrals" in _db_table_names(conn)
    for uid in seed_ids:
        conn.execute("DELETE FROM messages WHERE from_id = ? OR to_id = ?", (uid, uid))
        conn.execute("DELETE FROM swipes WHERE from_id = ? OR to_id = ?", (uid, uid))
        conn.execute("DELETE FROM user_tags WHERE user_id = ?", (uid,))
        conn.execute("DELETE FROM user_prompts WHERE user_id = ?", (uid,))
        conn.execute("DELETE FROM photos WHERE user_id = ?", (uid,))
        conn.execute("DELETE FROM albums WHERE user_id = ?", (uid,))
        conn.execute("DELETE FROM blocks WHERE from_id = ? OR to_id = ?", (uid, uid))
        conn.execute("DELETE FROM reports WHERE from_id = ? OR to_id = ?", (uid, uid))
        conn.execute("DELETE FROM reads WHERE user_id = ? OR other_id = ?", (uid, uid))
        conn.execute("DELETE FROM notifications WHERE user_id = ? OR from_id = ?", (uid, uid))
        conn.execute("DELETE FROM notes WHERE user_id = ? OR other_id = ?", (uid, uid))
        conn.execute("DELETE FROM snoozes WHERE user_id = ? OR other_id = ?", (uid, uid))
        conn.execute("DELETE FROM promo_redemptions WHERE user_id = ?", (uid,))
        if has_referrals:
            conn.execute("DELETE FROM referrals WHERE referrer_id = ? OR referred_id = ?", (uid, uid))
        conn.execute("DELETE FROM users WHERE id = ?", (uid,))

    for row in conn.execute("SELECT id, photo FROM users WHERE photo != ''"):
        if not conn.execute("SELECT 1 FROM photos WHERE user_id = ?", (row["id"],)).fetchone():
            _attach_portrait(conn, row["id"], row["photo"])

    # If running in local dev and dev user is absent, seed test data into PostgreSQL
    if not os.environ.get("TESTING") and not app.config.get("TESTING"):
        has_dev = conn.execute("SELECT 1 FROM users WHERE email = 'dev@wiring.test'").fetchone()
        if not has_dev:
            try:
                import importlib.util
                script_path = os.path.join(BASE_DIR, "scripts", "ensure_dev_user.py")
                if os.path.isfile(script_path):
                    spec = importlib.util.spec_from_file_location("ensure_dev_user", script_path)
                    if spec and spec.loader:
                        mod = importlib.util.module_from_spec(spec)
                        spec.loader.exec_module(mod)
                        dev_id = mod._ensure_dev(conn)
                        mod._ensure_peer(conn, dev_id)
                        from scripts.seed_test_social import seed_test_social
                        seed_test_social(conn, dev_id)
            except Exception:
                pass

    conn.commit()
    conn.close()


init_db()


def email_verify_enforced() -> bool:
    """Skip email confirmation in the test suite so existing flows stay intact."""
    return not bool(app.config.get("TESTING"))


def email_is_verified(row: Row | None) -> bool:
    if not row:
        return False
    keys = set(row.keys())
    email = str(row["email"] or "") if "email" in keys else ""
    if is_guest_email(email) or email.endswith("@wiring.demo"):
        return True
    if "email_verified_at" not in keys:
        return True
    return bool(row["email_verified_at"])


def issue_email_verification(conn: Connection, user_id: int, email: str) -> str:
    token = secrets.token_urlsafe(32)
    conn.execute("DELETE FROM email_verifications WHERE user_id = ?", (user_id,))
    conn.execute(
        "INSERT INTO email_verifications (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, int(time.time())),
    )
    link = f"{SITE_URL}/?verify={token}"
    send_mail(
        email,
        "WIRING — подтверди почту",
        f"Чтобы войти в WIRING, подтверди почту по ссылке (действует 48 часов):\n\n{link}\n\nЕсли это не ты — просто проигнорируй письмо.",
    )
    return token


def too_many(key: str, limit: int, window: float) -> bool:
    now = time.time()
    bucket = [ts for ts in _rate.get(key, []) if now - ts < window]
    if len(bucket) >= limit:
        _rate[key] = bucket
        return True
    bucket.append(now)
    _rate[key] = bucket
    return False


def is_guest_email(email: str) -> bool:
    return email.endswith("@wiring.guest") or email == "demo@wiring.app"


def is_demo_email(email: str) -> bool:
    value = (email or "").strip().lower()
    return (
        is_guest_email(value)
        or value.endswith("@example.com")
        or value.endswith("@wiring.demo")
        or value.endswith("@wiring.app")
    )


def is_live_profile(row: Row) -> bool:
    if int(row["is_seed"] or 0):
        return False
    return not is_demo_email(str(row["email"] or ""))


def _consent_yes(value: Any) -> bool:
    return value is True or value in (1, "1", "true", "True", "yes", "on")


def profile_complete(row: Row, tags: dict[str, list[str]] | None = None, photos: list | None = None) -> bool:
    """Ready to appear in the feed: age, neuro, photo, consents (city optional)."""
    if int(row["is_seed"] or 0) or is_guest_email(str(row["email"] or "")):
        return True
    tags = tags if tags is not None else tags_for(row["id"])
    if photos is None:
        photos = photos_for(row["id"])
    if int(row["age"] or 0) < 18:
        return False
    if str(row["gender"] or "") not in GENDER_IDS:
        return False
    if not photos and not str(row["photo"] or "").strip():
        return False
    keys = set(row.keys())
    if "special_data_consent_at" in keys and not row["special_data_consent_at"]:
        return False
    if "photo_rights_consent_at" in keys and not row["photo_rights_consent_at"]:
        return False
    return True


def media_url(path: str) -> str:
    if not path:
        return ""
    if path.startswith("portraits/") or path.startswith("people/"):
        return prefix(f"/public/{path}")
    return prefix(f"/media/{path}")


def tags_for(user_id: int) -> dict[str, list[str]]:
    from user_tags import normalize_user_tags

    neuro: list[str] = []
    vibe: list[str] = []
    for row in db().execute("SELECT kind, tag FROM user_tags WHERE user_id = ? ORDER BY tag", (user_id,)):
        if row["kind"] == "neuro":
            neuro.append(row["tag"])
        elif row["kind"] == "vibe":
            vibe.append(row["tag"])
    neuro, vibe = normalize_user_tags(neuro, vibe)
    return {"neuro": neuro, "vibe": vibe}


def prompts_for(user_id: int) -> list[dict[str, str]]:
    return [
        {"id": row["prompt_id"], "answer": row["answer"]}
        for row in db().execute(
            "SELECT prompt_id, answer FROM user_prompts WHERE user_id = ? ORDER BY sort_order, prompt_id",
            (user_id,),
        )
    ]


def photos_for(user_id: int) -> list[dict[str, Any]]:
    rows = db().execute(
        """
        SELECT p.id, p.path, p.is_primary, p.sort_order, p.album_id, a.title AS album
        FROM photos p
        LEFT JOIN albums a ON a.id = p.album_id
        WHERE p.user_id = ?
        ORDER BY p.is_primary DESC, p.sort_order ASC, p.id ASC
        """,
        (user_id,),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "url": media_url(row["path"]),
            "album_id": row["album_id"],
            "album": row["album"] or "я",
            "is_primary": bool(row["is_primary"]),
        }
        for row in rows
    ]


def albums_for(user_id: int) -> list[dict[str, Any]]:
    photos = photos_for(user_id)
    albums = [
        {"id": row["id"], "title": row["title"], "photos": []}
        for row in db().execute(
            "SELECT id, title FROM albums WHERE user_id = ? ORDER BY sort_order, id",
            (user_id,),
        )
    ]
    by_id = {item["id"]: item for item in albums}
    for photo in photos:
        bucket = by_id.get(photo["album_id"])
        if bucket is None:
            bucket = {"id": photo["album_id"] or 0, "title": photo["album"], "photos": []}
            albums.append(bucket)
            by_id[bucket["id"]] = bucket
        bucket["photos"].append(photo)
    return albums


def user_public(row: Row, include_email: bool = False, detail: bool = False) -> dict[str, Any]:
    tags = tags_for(row["id"])
    photos = photos_for(row["id"])
    urls = [item["url"] for item in photos]
    primary = next((item["url"] for item in photos if item["is_primary"]), urls[0] if urls else media_url(row["photo"]))
    keys = set(row.keys())
    last_seen = int(row["last_seen"] or 0) if "last_seen" in keys else 0
    payload = {
        "id": row["id"],
        "name": row["name"],
        "age": row["age"],
        "city": row["city"],
        "gender": row["gender"],
        "looking_for": row["looking_for"],
        "bio": row["bio"],
        "job": row["job"] if "job" in keys else "",
        "intent": (intents_of(row) or ["dating"])[0],
        "intents": intents_of(row),
        "height": row["height"] if "height" in keys else None,
        "communication": row["communication"] if "communication" in keys else "",
        "photo": primary or "",
        "photos": photos if detail else urls,
        "neuro": tags["neuro"],
        "vibe": tags["vibe"],
        "prompts": prompts_for(row["id"]),
        "online": bool(last_seen and time.time() - last_seen < ONLINE_WINDOW),
        "city_ok": is_catalog_city(str(row["city"] or "")),
        "has_photo": bool(photos) or bool(str(row["photo"] or "").strip()),
        "seek_min_age": int(row["seek_min_age"] or 18) if "seek_min_age" in keys else 18,
        "seek_max_age": int(row["seek_max_age"] or 99) if "seek_max_age" in keys else 99,
        "seek_place": str(row["seek_place"] or "") if "seek_place" in keys else "",
        "hide_tags": hide_tags_of(row),
    }
    if detail:
        payload["albums"] = albums_for(row["id"])
    if include_email:
        payload["email"] = row["email"]
        payload["guest"] = is_guest_email(str(row["email"]))
        complete = profile_complete(row, tags, photos)
        payload["needs_profile"] = not complete and not payload["guest"]
        payload["needs_onboard"] = payload["needs_profile"]
        payload["needs_city"] = False
        payload["needs_special_consent"] = not bool(row["special_data_consent_at"] if "special_data_consent_at" in keys else True)
        payload["needs_photo_consent"] = not bool(row["photo_rights_consent_at"] if "photo_rights_consent_at" in keys else True)
        payload["plus"] = is_premium(row)
        payload["plus_until"] = plus_until(row)
        payload["incognito"] = bool(int(row["incognito"] or 0)) if "incognito" in keys else False
        payload["paused"] = bool(int(row["paused"] or 0)) if "paused" in keys else False
        payload["notify_enabled"] = bool(int(row["notify_enabled"] if "notify_enabled" in keys else 1))
        payload["notify_push"] = bool(int(row["notify_push"] if "notify_push" in keys else 1))
        jev_allowed, jev_configured = jev_access(int(row["id"]))
        jev_allowed = bool(jev_allowed and not payload["guest"] and not int(row["is_seed"] or 0))
        payload["jev_feed_beta"] = jev_allowed
        payload["jev_feed_available"] = bool(jev_allowed and jev_configured)
        payload["jev_feed_enabled"] = bool(jev_allowed and int(row["jev_feed_enabled"] or 0)) if "jev_feed_enabled" in keys else False
        code = str(row["referral_code"] or "") if "referral_code" in keys else ""
        if code and not is_guest_email(str(row["email"])) and not int(row["is_seed"] or 0):
            payload["ref"] = code
            payload["ref_url"] = f"{SITE_URL}/r/{code}"
            payload["ref_count"] = referral_count(db(), row["id"])
            payload["ref_days"] = REFERRAL_DAYS
    return payload


def inbox_stats(uid: int) -> dict[str, int]:
    conn = db()
    blocked = blocked_ids(conn, uid)
    likes = 0
    for row in conn.execute(
        """
        SELECT s.from_id, u.email FROM swipes s
        JOIN users u ON u.id = s.from_id
        WHERE s.to_id = ? AND s.direction = 'like'
          AND COALESCE(u.is_seed, 0) = 0
          AND COALESCE(u.deleted_at, 0) = 0
          AND s.from_id NOT IN (SELECT to_id FROM swipes WHERE from_id = ?)
          AND (
            EXISTS (SELECT 1 FROM photos p WHERE p.user_id = u.id)
            OR (u.photo IS NOT NULL AND u.photo != '')
          )
        """,
        (uid, uid),
    ):
        if row["from_id"] in blocked or is_guest_email(str(row["email"] or "")):
            continue
        likes += 1
    unread = 0
    for row in conn.execute(
        """
        SELECT u.id FROM users u
        JOIN swipes a ON a.to_id = u.id AND a.from_id = ? AND a.direction = 'like'
        JOIN swipes b ON b.from_id = u.id AND b.to_id = ? AND b.direction = 'like'
        WHERE COALESCE(u.deleted_at, 0) = 0
        """,
        (uid, uid),
    ):
        if row["id"] in blocked:
            continue
        unread += unread_count(conn, uid, row["id"])
    return {"likes_in": likes, "unread": unread}


def current_user() -> dict[str, Any] | None:
    uid = session.get("uid")
    if not uid:
        return None
    conn = db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not row or ("deleted_at" in row.keys() and row["deleted_at"]):
        return None
    if not is_guest_email(str(row["email"])) and not int(row["is_seed"] or 0):
        ensure_referral_code(conn, uid)
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    payload = user_public(row, include_email=True, detail=True)
    payload.update(inbox_stats(uid))
    liked = db().execute(
        "SELECT COUNT(*) AS n FROM swipes WHERE from_id = ? AND direction = 'like'",
        (uid,),
    ).fetchone()["n"]
    payload["guest_nudge"] = bool(payload.get("guest") and liked >= 3)
    payload["notices"] = unread_notices(db(), uid)
    return payload


def touch_seen(uid: int) -> None:
    db().execute("UPDATE users SET last_seen = ? WHERE id = ?", (int(time.time()), uid))
    db().commit()


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("uid"):
            return jsonify({"ok": False, "error": "нужна сессия"}), 401
        touch_seen(session["uid"])
        return fn(*args, **kwargs)

    return wrapper


def real_account_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        uid = session.get("uid")
        if not uid:
            return jsonify({"ok": False, "error": "нужна сессия"}), 401
        row = db().execute("SELECT email FROM users WHERE id = ?", (uid,)).fetchone()
        if not row or is_guest_email(str(row["email"])):
            return jsonify({"ok": False, "error": "сначала собери свой профиль"}), 403
        return fn(*args, **kwargs)

    return wrapper


def parse_tags(raw: Any, allowed: set[str], *, required: bool) -> tuple[list[str] | None, str | None]:
    if raw is None:
        return ([], None) if not required else (None, "выбери хотя бы один тег")
    if not isinstance(raw, list):
        return None, "теги должны быть списком"
    cleaned: list[str] = []
    for item in raw:
        if not isinstance(item, str) or item not in allowed:
            return None, f"неизвестный тег: {item}"
        if item not in cleaned:
            cleaned.append(item)
    if required and not cleaned:
        return None, "выбери хотя бы один нейротип"
    return cleaned, None


def parse_prompts(raw: Any) -> tuple[list[dict[str, str]] | None, str | None]:
    if raw is None:
        return [], None
    if not isinstance(raw, list):
        return None, "промпты должны быть списком"
    if len(raw) > MAX_PROMPTS:
        return None, "можно три промпта"
    cleaned: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            return None, "промпт — объект с id и ответом"
        pid = str(item.get("id") or "")
        answer = str(item.get("answer") or "").strip()
        if pid not in PROMPT_IDS:
            return None, "неизвестный промпт"
        if pid in seen:
            continue
        if not (4 <= len(answer) <= 280):
            return None, "ответ промпта: 4–280 символов"
        seen.add(pid)
        cleaned.append({"id": pid, "answer": answer})
    return cleaned, None


def parse_intents(raw: Any) -> list[str]:
    if isinstance(raw, list):
        items = raw
    else:
        text = str(raw or "").strip()
        if not text:
            items = []
        elif text.startswith("["):
            try:
                import json

                parsed = json.loads(text)
                items = parsed if isinstance(parsed, list) else [text]
            except (TypeError, ValueError):
                items = re.split(r"[,;|]+", text)
        else:
            items = re.split(r"[,;|]+", text)
    out: list[str] = []
    for item in items:
        value = str(item or "").strip()
        if value in INTENT_IDS and value not in out:
            out.append(value)
    return out


def intents_store(items: list[str]) -> str:
    return ",".join(items) if items else "dating"


def intents_of(row_or_value: Any) -> list[str]:
    if hasattr(row_or_value, "keys") and not isinstance(row_or_value, (str, bytes, dict)):
        keys = set(row_or_value.keys())
        raw = row_or_value["intent"] if "intent" in keys else "dating"
    else:
        raw = row_or_value
    found = parse_intents(raw)
    return found or ["dating"]


def parse_profile(
    data: dict[str, Any], *, require_password: bool, require_neuro: bool = True, draft: bool = False
) -> tuple[dict[str, Any] | None, str | None]:
    name = str(data.get("name") or "").strip()
    if "city" in data and not str(data.get("city") or "").strip():
        city = ""
    else:
        city_raw = str(data.get("city") or "").strip()
        city = normalize_city(city_raw) if city_raw else ""
    bio = str(data.get("bio") or "").strip()
    gender = str(data.get("gender") or "").strip()
    looking_for = str(data.get("looking_for") or "").strip()
    job = str(data.get("job") or "").strip()
    communication = str(data.get("communication") or "").strip()
    intents = parse_intents(data.get("intents") if data.get("intents") is not None else data.get("intent"))
    if not intents:
        intents = ["dating"]
    try:
        age = int(data.get("age"))
    except (TypeError, ValueError):
        return None, "возраст — число"
    height_raw = data.get("height")
    height = None
    if height_raw not in (None, "", 0, "0"):
        try:
            height = int(height_raw)
        except (TypeError, ValueError):
            return None, "рост — число в см"
        if not (140 <= height <= 220):
            return None, "рост: 140–220 см"
    if not (2 <= len(name) <= 32):
        return None, "имя: 2–32 символа"
    if not (18 <= age <= 99):
        return None, "только 18+"
    if city:
        if len(city) < 2 or len(city) > 48:
            if draft:
                city = "—"
            else:
                return None, "город: 2–48 символов"
        elif not is_catalog_city(city):
            if draft and len(city) >= 2:
                pass
            else:
                return None, "выбери город из списка"
    if len(bio) > 1200:
        return None, "био до 1200 символов"
    if len(job) > 60:
        return None, "занятие до 60 символов"
    if len(communication) > 280:
        return None, "как тебе писать: до 280 символов"
    for label, value in (
        ("имя", name),
        ("о себе", bio),
        ("занятость", job),
        ("как тебе писать", communication),
    ):
        if has_profanity(value):
            return None, f"в поле «{label}» есть мат — переформулируй"
    if gender not in GENDER_IDS:
        return None, "выбери гендер"
    if looking_for not in LOOKING_IDS:
        return None, "кого ищешь?"
    neuro, err = parse_tags(data.get("neuro"), NEURO_IDS, required=require_neuro)
    if err:
        return None, err
    vibe, err = parse_tags(data.get("vibe"), VIBE_IDS, required=False)
    if err:
        return None, err
    prompts, err = parse_prompts(data.get("prompts"))
    if err:
        return None, err
    for prompt in prompts or []:
        if has_profanity(str(prompt.get("answer") or "")):
            return None, "в промпте есть мат — переформулируй"
    seek_min: int | None = None
    seek_max: int | None = None
    if "seek_min_age" in data or "seek_max_age" in data:
        try:
            seek_min = int(data.get("seek_min_age") if data.get("seek_min_age") not in (None, "") else 18)
            seek_max = int(data.get("seek_max_age") if data.get("seek_max_age") not in (None, "") else 99)
        except (TypeError, ValueError):
            return None, "возраст видимости — числа"
        seek_min = max(18, min(99, seek_min))
        seek_max = max(18, min(99, seek_max))
        if seek_min > seek_max:
            seek_min, seek_max = seek_max, seek_min
    seek_place: str | None = None
    if "seek_place" in data:
        seek_place = str(data.get("seek_place") or "").strip()
        if seek_place:
            as_city = catalog_city(seek_place) or normalize_city(seek_place)
            countries = {str(b.get("country") or "") for b in PLACES}
            if as_city and is_catalog_city(as_city):
                seek_place = as_city
            elif seek_place not in countries:
                return None, "страна или город из списка"
    hide: list[str] | None = None
    if "hide_tags" in data:
        hide = parse_hide_tags(data.get("hide_tags"))
    payload: dict[str, Any] = {
        "name": name,
        "age": age,
        "city": city,
        "gender": gender,
        "looking_for": looking_for,
        "bio": bio,
        "job": job,
        "intent": intents_store(intents),
        "intents": intents,
        "height": height,
        "communication": communication,
        "neuro": neuro,
        "vibe": vibe or [],
        "prompts": prompts or [],
        "seek_min_age": seek_min,
        "seek_max_age": seek_max,
        "seek_place": seek_place,
        "hide_tags": hide,
    }
    photo = str(data.get("photo") or "").strip()
    if photo and photo not in SEED_PHOTOS:
        return None, "выбери фото из набора или загрузи своё"
    payload["photo"] = photo
    if require_password:
        email = str(data.get("email") or "").strip().lower()
        password = str(data.get("password") or "")
        if not EMAIL_RE.match(email):
            return None, "нужна нормальная почта"
        if len(password) < 6:
            return None, "пароль минимум 6 символов"
        payload["email"] = email
        payload["password"] = password
    return payload, None


def replace_tags(conn: Connection, user_id: int, neuro: list[str], vibe: list[str]) -> None:
    conn.execute("DELETE FROM user_tags WHERE user_id = ?", (user_id,))
    for tag in neuro:
        conn.execute("INSERT INTO user_tags (user_id, kind, tag) VALUES (?, 'neuro', ?)", (user_id, tag))
    for tag in vibe:
        conn.execute("INSERT INTO user_tags (user_id, kind, tag) VALUES (?, 'vibe', ?)", (user_id, tag))


def looking_matches(viewer_looking: str, candidate_gender: str) -> bool:
    if viewer_looking in {"everyone", "friends"}:
        return True
    if candidate_gender in {"hidden", "other"}:
        return True
    if viewer_looking == "women":
        return candidate_gender == "woman"
    if viewer_looking == "men":
        return candidate_gender == "man"
    return True


def mutual_looking_ok(a_looking: str, a_gender: str, b_looking: str, b_gender: str) -> bool:
    return looking_matches(a_looking, b_gender) and looking_matches(b_looking, a_gender)


def parse_hide_tags(raw: Any) -> list[str]:
    from user_tags import filter_hide_tags

    if isinstance(raw, list):
        items = [str(x).strip() for x in raw if str(x).strip()]
    else:
        items = [p.strip() for p in str(raw or "").split(",") if p.strip()]
    return filter_hide_tags(items)


def hide_tags_of(row: Row | dict[str, Any] | None) -> list[str]:
    if not row:
        return []
    keys = set(row.keys()) if hasattr(row, "keys") else set()
    if "hide_tags" not in keys and not isinstance(row, dict):
        return []
    raw = row["hide_tags"] if not isinstance(row, dict) else row.get("hide_tags")
    return parse_hide_tags(raw)


def discovery_allows(owner: Row, viewer: Row) -> bool:
    """Whether `viewer` is allowed to see `owner` in the feed."""
    keys = set(owner.keys())
    viewer_age = int(viewer["age"] or 0)
    vmin = int(owner["seek_min_age"] or 18) if "seek_min_age" in keys else 18
    vmax = int(owner["seek_max_age"] or 99) if "seek_max_age" in keys else 99
    vmin = max(18, min(99, vmin))
    vmax = max(18, min(99, vmax))
    if vmin > vmax:
        vmin, vmax = vmax, vmin
    if viewer_age < vmin or viewer_age > vmax:
        return False
    place = str(owner["seek_place"] or "").strip() if "seek_place" in keys else ""
    if place:
        viewer_city = str(viewer["city"] or "").strip()
        viewer_country = country_of_city(viewer_city)
        if place != viewer_city and place != viewer_country:
            return False
    blocked = hide_tags_of(owner)
    if blocked:
        tags = tags_for(int(viewer["id"]))
        mine = set(tags.get("neuro") or []) | set(tags.get("vibe") or [])
        if mine & set(blocked):
            return False
    return True


def _notifiable(row: Row) -> bool:
    if not is_live_profile(row):
        return False
    keys = set(row.keys())
    if "notify_enabled" in keys and not int(row["notify_enabled"] or 0):
        return False
    return True


def maybe_finish_onboard(conn: Connection, uid: int) -> None:
    row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not row or is_guest_email(str(row["email"])):
        return
    if profile_complete(row):
        conn.execute("UPDATE users SET onboard_done = 1 WHERE id = ?", (uid,))
    else:
        conn.execute("UPDATE users SET onboard_done = 0 WHERE id = ?", (uid,))


def _token_ok(got: str, expected: str) -> bool:
    if not got or not expected:
        return False
    left = got.encode("utf-8")
    right = expected.encode("utf-8")
    if len(left) != len(right):
        return False
    return secrets.compare_digest(left, right)


def blocked_ids(conn: Connection, uid: int) -> set[int]:
    rows = conn.execute(
        """
        SELECT to_id AS id FROM blocks WHERE from_id = ?
        UNION
        SELECT from_id AS id FROM blocks WHERE to_id = ?
        """,
        (uid, uid),
    )
    return {int(row["id"]) for row in rows}


def unread_count(conn: Connection, me: int, other: int) -> int:
    row = conn.execute(
        "SELECT last_read_id FROM reads WHERE user_id = ? AND other_id = ? AND COALESCE(deleted_at, 0) = 0",
        (me, other),
    ).fetchone()
    last_id = int(row["last_read_id"]) if row else 0
    return int(
        conn.execute(
            "SELECT COUNT(*) AS n FROM messages WHERE from_id = ? AND to_id = ? AND id > ? AND COALESCE(deleted_at, 0) = 0",
            (other, me, last_id),
        ).fetchone()["n"]
    )


def mark_read(conn: Connection, me: int, other: int) -> None:
    last = conn.execute(
        """
        SELECT id FROM messages
        WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))
          AND COALESCE(deleted_at, 0) = 0
        ORDER BY id DESC LIMIT 1
        """,
        (me, other, other, me),
    ).fetchone()
    last_id = int(last["id"]) if last else 0
    conn.execute(
        """
        INSERT INTO reads (user_id, other_id, last_read_id, deleted_at) VALUES (?, ?, ?, NULL)
        ON CONFLICT(user_id, other_id) DO UPDATE SET last_read_id = excluded.last_read_id, deleted_at = NULL
        """,
        (me, other, last_id),
    )


def purge_user_aux_data(conn: Connection, uid: int) -> None:
    """Purges auxiliary user data (photos, messages, etc.).
    Database requirement: The user record in 'users' is NEVER deleted!
    """
    conn.execute("DELETE FROM messages WHERE from_id = ? OR to_id = ?", (uid, uid))
    conn.execute("DELETE FROM swipes WHERE from_id = ? OR to_id = ?", (uid, uid))
    conn.execute("DELETE FROM feed_history WHERE user_id = ? OR other_id = ?", (uid, uid))
    conn.execute("DELETE FROM user_tags WHERE user_id = ?", (uid,))
    conn.execute("DELETE FROM user_prompts WHERE user_id = ?", (uid,))
    conn.execute("DELETE FROM photos WHERE user_id = ?", (uid,))
    conn.execute("DELETE FROM albums WHERE user_id = ?", (uid,))
    conn.execute("DELETE FROM blocks WHERE from_id = ? OR to_id = ?", (uid, uid))
    conn.execute("DELETE FROM reports WHERE from_id = ? OR to_id = ?", (uid, uid))
    conn.execute("DELETE FROM reads WHERE user_id = ? OR other_id = ?", (uid, uid))
    conn.execute("DELETE FROM notifications WHERE user_id = ? OR from_id = ?", (uid, uid))
    conn.execute("DELETE FROM notes WHERE user_id = ? OR other_id = ?", (uid, uid))
    conn.execute("DELETE FROM snoozes WHERE user_id = ? OR other_id = ?", (uid, uid))
    conn.execute("DELETE FROM promo_redemptions WHERE user_id = ?", (uid,))
    conn.execute("DELETE FROM referrals WHERE referrer_id = ? OR referred_id = ?", (uid, uid))
    conn.execute("DELETE FROM password_resets WHERE user_id = ?", (uid,))
    conn.execute("DELETE FROM email_verifications WHERE user_id = ?", (uid,))
    folder = os.path.join(UPLOAD_DIR, str(uid))
    if os.path.isdir(folder):
        shutil.rmtree(folder, ignore_errors=True)


def _purge_deleted_users_data(conn: Connection) -> None:
    """Full auxiliary data wipe for accounts deleted > 7 days (604800s) ago.
    The user row in 'users' is NEVER deleted, keeping the deleted_at flag.
    """
    cutoff = int(time.time()) - 7 * 86400
    rows = conn.execute(
        "SELECT id FROM users WHERE deleted_at IS NOT NULL AND deleted_at > 0 AND deleted_at < ?",
        (cutoff,),
    ).fetchall()
    for r in rows:
        purge_user_aux_data(conn, int(r["id"]))


def wipe_user(conn: Connection, uid: int) -> None:
    purge_user_aux_data(conn, uid)
    conn.execute("DELETE FROM users WHERE id = ?", (uid,))


def _purge_old_guests(conn: Connection) -> None:
    cutoff = int(time.time()) - 60 * 60 * 24 * 3
    ids = [
        r["id"]
        for r in conn.execute(
            "SELECT id FROM users WHERE email LIKE 'guest-%@wiring.guest' AND created_at < ?",
            (cutoff,),
        )
    ]
    for uid in ids:
        wipe_user(conn, uid)
    _purge_deleted_users_data(conn)


def _clear_pair(conn: Connection, uid: int, target_id: int) -> None:
    conn.execute("DELETE FROM swipes WHERE from_id = ? AND to_id = ?", (uid, target_id))
    target = conn.execute("SELECT is_seed FROM users WHERE id = ?", (target_id,)).fetchone()
    if target and target["is_seed"]:
        conn.execute("DELETE FROM swipes WHERE from_id = ? AND to_id = ?", (target_id, uid))


def _is_match(conn: Connection, a: int, b: int) -> bool:
    row_b = conn.execute("SELECT deleted_at FROM users WHERE id = ?", (b,)).fetchone()
    if row_b and "deleted_at" in row_b.keys() and row_b["deleted_at"]:
        return False
    row_a = conn.execute("SELECT deleted_at FROM users WHERE id = ?", (a,)).fetchone()
    if row_a and "deleted_at" in row_a.keys() and row_a["deleted_at"]:
        return False
    left = conn.execute(
        "SELECT direction FROM swipes WHERE from_id = ? AND to_id = ?",
        (a, b),
    ).fetchone()
    right = conn.execute(
        "SELECT direction FROM swipes WHERE from_id = ? AND to_id = ?",
        (b, a),
    ).fetchone()
    return bool(left and right and left["direction"] == "like" and right["direction"] == "like")


def _unmatch_pair(conn: Connection, uid: int, other_id: int) -> None:
    """Hide chat: your side becomes a pass, their like is dropped.

    The chat history is retained and soft-deleted for audit/recovery. They leave
    Чаты and Лайки and stay out of the лента until you restore passes.
    """
    now = int(time.time())
    conn.execute(
        """
        UPDATE messages SET deleted_at = ?
        WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))
          AND deleted_at IS NULL
        """,
        (now, uid, other_id, other_id, uid),
    )
    conn.execute(
        """
        UPDATE reads SET deleted_at = ?
        WHERE (user_id = ? AND other_id = ?) OR (user_id = ? AND other_id = ?)
        """,
        (now, uid, other_id, other_id, uid),
    )
    conn.execute(
        """
        INSERT INTO swipes (from_id, to_id, direction, created_at)
        VALUES (?, ?, 'pass', ?)
        ON CONFLICT(from_id, to_id) DO UPDATE SET direction = 'pass', created_at = excluded.created_at
        """,
        (uid, other_id, now),
    )
    conn.execute("DELETE FROM swipes WHERE from_id = ? AND to_id = ?", (other_id, uid))
    clear_openers(conn, uid, other_id)


def _spa() -> str:
    return render_template("index.html", base_path=BASE_PATH, site_url=SITE_URL)


@app.get("/")
def index():
    if BASE_PATH and request.path.rstrip("/") == "":
        return redirect(prefix("/"))
    return _spa()


@app.get("/sign-in")
@app.get("/sign-up")
@app.get("/login")
@app.get("/register")
@app.get("/forgot")
@app.get("/reset")
@app.get("/verify")
@app.get("/feed")
@app.get("/likes")
@app.get("/chats")
@app.get("/chats/<int:chat_id>")
@app.get("/me")
@app.get("/consents")
@app.get("/plus")
@app.get("/premium")
@app.get("/onboard")
@app.get("/delete-account")
@app.get("/p/<int:person_id>")
@app.get("/r/<code>")
@app.get("/support")
@app.get("/notifications")
def spa_app(**_kwargs):
    return _spa()


@app.get("/health")
def health():
    count = db().execute("SELECT COUNT(*) AS n FROM users WHERE COALESCE(deleted_at, 0) = 0").fetchone()["n"]
    return jsonify({"ok": True, "users": count})


@app.get("/api/catalog")
def api_catalog():
    return jsonify({"ok": True, **catalog_payload()})


@app.get("/api/me")
def api_me():
    user = current_user()
    return jsonify({"ok": True, "user": user})


@app.post("/api/me/jev-feed")
@login_required
@real_account_required
def api_jev_feed_setting():
    uid = int(session["uid"])
    allowed, configured = jev_access(uid)
    if not allowed:
        return jsonify({"ok": False, "error": "эксперимент недоступен"}), 404
    data = request.get_json(silent=True) or {}
    if not isinstance(data.get("enabled"), bool):
        return jsonify({"ok": False, "error": "укажи состояние переключателя"}), 400
    enabled = data["enabled"]
    if enabled and not configured:
        return jsonify({"ok": False, "error": "эксперимент пока не настроен"}), 503
    db().execute("UPDATE users SET jev_feed_enabled = ? WHERE id = ?", (int(enabled), uid))
    db().commit()
    return jsonify({"ok": True, "user": current_user()})


@app.post("/api/register")
def api_register():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "x").split(",")[0].strip()
    if too_many(f"reg:{ip}", 8, 3600):
        return jsonify({"ok": False, "error": "слишком много регистраций, подожди"}), 429
    data = request.get_json(silent=True) or {}
    if not data.get("age_confirm"):
        return jsonify({"ok": False, "error": "нужно подтвердить, что тебе есть 18"}), 400
    if data.get("privacy_confirm") is not True:
        return jsonify({"ok": False, "error": "нужно согласие на обработку персональных данных и политику конфиденциальности"}), 400
    name = str(data.get("name") or "").strip()
    email = str(data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")
    if not (2 <= len(name) <= 32):
        return jsonify({"ok": False, "error": "имя: 2–32 символа"}), 400
    if not EMAIL_RE.match(email) or "@wiring.guest" in email or email.endswith("@wiring.demo"):
        return jsonify({"ok": False, "error": "нужна нормальная почта"}), 400
    if len(password) < 6:
        return jsonify({"ok": False, "error": "пароль минимум 6 символов"}), 400
    conn = db()
    if conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
        return jsonify({"ok": False, "error": "такая почта уже есть"}), 409
    consented_at = int(time.time())
    marketing_at = consented_at if data.get("marketing_consent") is True else None
    need_verify = email_verify_enforced()
    verified_at = None if need_verify else consented_at
    cur = conn.execute(
        """
        INSERT INTO users (
            email, password_hash, name, age, city, gender, looking_for, bio, photo,
            job, intent, height, communication, privacy_accepted_at,
            special_data_consent_at, photo_rights_consent_at, marketing_consent_at,
            email_verified_at, onboard_done, is_seed, created_at, last_seen
        )
        VALUES (?, ?, ?, 18, '', 'other', 'everyone', '', '', '', 'dating', NULL, '', ?, NULL, NULL, ?, ?, 0, 0, ?, ?)
        """,
        (
            email,
            generate_password_hash(password, method="pbkdf2:sha256"),
            name,
            consented_at,
            marketing_at,
            verified_at,
            consented_at,
            consented_at,
        ),
    )
    uid = int(cur.lastrowid)
    ensure_referral_code(conn, uid)
    referrer_id = apply_referral(conn, uid, str(data.get("ref") or data.get("referral") or ""))
    if referrer_id:
        add_notice(
            conn,
            referrer_id,
            "referral",
            0,
            f"по твоей ссылке зарегистрировались — WIRING+ на {REFERRAL_DAYS} дней",
        )
    if need_verify:
        issue_email_verification(conn, uid, email)
        conn.commit()
        session.clear()
        return jsonify({"ok": True, "needs_email_verify": True, "email": email})
    conn.commit()
    session.clear()
    session.permanent = True
    session["uid"] = uid
    return jsonify({"ok": True, "user": current_user()})


@app.post("/api/login")
def api_login():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "x").split(",")[0].strip()
    if too_many(f"login:{ip}", 20, 300):
        return jsonify({"ok": False, "error": "слишком много попыток"}), 429
    data = request.get_json(silent=True) or {}
    email = str(data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")
    row = db().execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"ok": False, "error": "неверная почта или пароль"}), 401
    if "deleted_at" in row.keys() and row["deleted_at"]:
        return jsonify(
            {
                "ok": False,
                "error": "аккаунт удалён (восстановление доступно в течение 7 суток)",
                "deleted": True,
            }
        ), 403
    if email_verify_enforced() and not email_is_verified(row):
        return jsonify(
            {
                "ok": False,
                "error": "подтверди почту — мы отправили ссылку",
                "needs_email_verify": True,
                "email": email,
            }
        ), 403
    session.clear()
    session.permanent = True
    session["uid"] = row["id"]
    db().execute("UPDATE users SET last_seen = ? WHERE id = ?", (int(time.time()), row["id"]))
    db().commit()
    return jsonify({"ok": True, "user": current_user()})


@app.post("/api/email/verify")
def api_email_verify():
    data = request.get_json(silent=True) or {}
    token = str(data.get("token") or "").strip()
    if not token:
        return jsonify({"ok": False, "error": "нет токена"}), 400
    conn = db()
    row = conn.execute(
        "SELECT token, user_id, created_at, used_at FROM email_verifications WHERE token = ?",
        (token,),
    ).fetchone()
    if not row or row["used_at"] or int(time.time()) - int(row["created_at"]) > 172800:
        return jsonify({"ok": False, "error": "ссылка устарела или уже использована"}), 400
    user = conn.execute("SELECT * FROM users WHERE id = ?", (row["user_id"],)).fetchone()
    if not user:
        return jsonify({"ok": False, "error": "аккаунт не найден"}), 400
    now = int(time.time())
    conn.execute(
        "UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), last_seen = ? WHERE id = ?",
        (now, now, row["user_id"]),
    )
    conn.execute("UPDATE email_verifications SET used_at = ? WHERE token = ?", (now, token))
    conn.commit()
    session.clear()
    session.permanent = True
    session["uid"] = row["user_id"]
    return jsonify({"ok": True, "user": current_user()})


@app.post("/api/email/resend")
def api_email_resend():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "x").split(",")[0].strip()
    if too_many(f"emailverify:{ip}", 8, 600):
        return jsonify({"ok": False, "error": "слишком много попыток"}), 429
    data = request.get_json(silent=True) or {}
    email = str(data.get("email") or "").strip().lower()
    if EMAIL_RE.match(email) and "@wiring.guest" not in email and not email.endswith("@wiring.demo"):
        conn = db()
        row = conn.execute(
            "SELECT * FROM users WHERE email = ? AND COALESCE(is_seed, 0) = 0",
            (email,),
        ).fetchone()
        if row and not email_is_verified(row):
            issue_email_verification(conn, int(row["id"]), email)
            conn.commit()
    return jsonify({"ok": True})


@app.post("/api/password/forgot")
def api_password_forgot():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "x").split(",")[0].strip()
    if too_many(f"pwforgot:{ip}", 8, 600):
        return jsonify({"ok": False, "error": "слишком много попыток"}), 429
    data = request.get_json(silent=True) or {}
    email = str(data.get("email") or "").strip().lower()
    if EMAIL_RE.match(email) and "@wiring.guest" not in email and not email.endswith("@wiring.demo"):
        conn = db()
        row = conn.execute(
            "SELECT id FROM users WHERE email = ? AND COALESCE(is_seed, 0) = 0",
            (email,),
        ).fetchone()
        if row:
            token = secrets.token_urlsafe(32)
            conn.execute("DELETE FROM password_resets WHERE user_id = ?", (row["id"],))
            conn.execute(
                "INSERT INTO password_resets (token, user_id, created_at) VALUES (?, ?, ?)",
                (token, row["id"], int(time.time())),
            )
            conn.commit()
            link = f"{SITE_URL}/?reset={token}"
            send_mail(
                email,
                "WIRING — сброс пароля",
                f"Ссылка действует 2 часа:\n\n{link}\n\nЕсли это не ты — просто проигнорируй письмо.",
            )
    return jsonify({"ok": True})


@app.post("/api/password/reset")
def api_password_reset():
    data = request.get_json(silent=True) or {}
    token = str(data.get("token") or "").strip()
    password = str(data.get("password") or "")
    if len(password) < 6:
        return jsonify({"ok": False, "error": "пароль минимум 6 символов"}), 400
    if not token:
        return jsonify({"ok": False, "error": "нет токена"}), 400
    conn = db()
    row = conn.execute(
        "SELECT token, user_id, created_at, used_at FROM password_resets WHERE token = ?",
        (token,),
    ).fetchone()
    if not row or row["used_at"] or int(time.time()) - int(row["created_at"]) > 7200:
        return jsonify({"ok": False, "error": "ссылка устарела или уже использована"}), 400
    conn.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (generate_password_hash(password, method="pbkdf2:sha256"), row["user_id"]),
    )
    conn.execute("UPDATE password_resets SET used_at = ? WHERE token = ?", (int(time.time()), token))
    conn.commit()
    return jsonify({"ok": True})


@app.post("/api/me/city")
@login_required
def api_me_city():
    data = request.get_json(silent=True) or {}
    city = normalize_city(str(data.get("city") or "").strip())
    if not city or len(city) < 2 or len(city) > 48:
        return jsonify({"ok": False, "error": "город: 2–48 символов"}), 400
    if not is_catalog_city(city):
        return jsonify({"ok": False, "error": "выбери город из списка"}), 400
    conn = db()
    conn.execute("UPDATE users SET city = ? WHERE id = ?", (city, session["uid"]))
    conn.commit()
    return jsonify({"ok": True, "user": current_user()})


@app.post("/api/demo")
def api_demo():
    conn = db()
    _purge_old_guests(conn)
    email = f"guest-{secrets.token_hex(8)}@wiring.guest"
    cur = conn.execute(
        """
        INSERT INTO users (email, password_hash, name, age, city, gender, looking_for, bio, photo,
                           email_verified_at, is_seed, created_at, last_seen)
        VALUES (?, ?, 'Гость', 28, 'онлайн / не важно', 'other', 'everyone',
                'Смотрю анкеты. Свой профиль соберу чуть позже.',
                '', ?, 0, ?, ?)
        """,
        (email, generate_password_hash(secrets.token_urlsafe(18), method="pbkdf2:sha256"), int(time.time()), int(time.time()), int(time.time())),
    )
    uid = int(cur.lastrowid)
    replace_tags(conn, uid, ["audhd"], ["selfdx", "terminally-online"])
    conn.commit()
    session.clear()
    session.permanent = True
    session["uid"] = uid
    row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return jsonify({"ok": True, "user": user_public(row, include_email=True, detail=True)})


@app.post("/api/logout")
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.post("/api/me/delete")
@app.delete("/api/me")
@login_required
def api_delete_me():
    uid = session["uid"]
    conn = db()
    me = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not me:
        session.clear()
        return jsonify({"ok": False, "error": "нет профиля"}), 401
    data = request.get_json(silent=True) or {}
    if not is_guest_email(str(me["email"])):
        password = str(data.get("password") or "")
        if not password:
            return jsonify({"ok": False, "error": "введи пароль для подтверждения"}), 400
        if not check_password_hash(me["password_hash"], password):
            return jsonify({"ok": False, "error": "неверный пароль"}), 401
    now = int(time.time())
    # Database requirement: The user record in 'users' is NEVER deleted, only stamped with deleted_at!
    conn.execute("UPDATE users SET deleted_at = ? WHERE id = ?", (now, uid))
    conn.commit()
    session.clear()
    return jsonify({"ok": True})


def _merge_me_for_draft(me: Row, data: dict[str, Any]) -> dict[str, Any]:
    tags = tags_for(me["id"])
    intents = intents_of(me)
    return {
        "name": data.get("name", me["name"]),
        "age": data.get("age", me["age"]),
        "city": me["city"] if "city" not in data else data.get("city"),
        "gender": data.get("gender", me["gender"]),
        "looking_for": data.get("looking_for", me["looking_for"]),
        "bio": data.get("bio", me["bio"]),
        "job": data.get("job", me["job"] if "job" in me.keys() else ""),
        "communication": data.get("communication", me["communication"] if "communication" in me.keys() else ""),
        "intents": data.get("intents", intents),
        "intent": data.get("intent", intents[0] if intents else "dating"),
        "height": data.get("height", me["height"] if "height" in me.keys() else None),
        "neuro": data.get("neuro", tags["neuro"]),
        "vibe": data.get("vibe", tags["vibe"]),
        "prompts": data.get("prompts", prompts_for(me["id"])),
        "seek_min_age": data.get("seek_min_age", me["seek_min_age"] if "seek_min_age" in me.keys() else 18),
        "seek_max_age": data.get("seek_max_age", me["seek_max_age"] if "seek_max_age" in me.keys() else 99),
        "seek_place": data.get("seek_place", me["seek_place"] if "seek_place" in me.keys() else ""),
        "hide_tags": data.get("hide_tags", hide_tags_of(me)),
        "photo": data.get("photo", me["photo"]),
        "special_data_consent": data.get("special_data_consent"),
        "photo_rights_consent": data.get("photo_rights_consent"),
    }


@app.patch("/api/me")
@login_required
def api_patch_me():
    data = request.get_json(silent=True) or {}
    draft = bool(data.get("draft"))
    uid = session["uid"]
    conn = db()
    me = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not me:
        return jsonify({"ok": False, "error": "нет профиля"}), 401
    payload_in = _merge_me_for_draft(me, data) if draft else {**data}
    parsed, err = parse_profile(
        {**payload_in, "email": "x@y.zz", "password": "ignore1"},
        require_password=False,
        require_neuro=False,
        draft=draft,
    )
    if err or parsed is None:
        return jsonify({"ok": False, "error": err}), 400
    now = int(time.time())
    special_at = me["special_data_consent_at"] if "special_data_consent_at" in me.keys() else None
    photo_at = me["photo_rights_consent_at"] if "photo_rights_consent_at" in me.keys() else None
    if _consent_yes(data.get("special_data_consent")):
        special_at = special_at or now
    if _consent_yes(data.get("photo_rights_consent")):
        photo_at = photo_at or now
    if parsed["neuro"] and not special_at and not draft:
        return jsonify({"ok": False, "error": "нужно согласие на обработку и показ выбранных особенностей"}), 400
    me_keys = set(me.keys())
    seek_min = parsed.get("seek_min_age")
    seek_max = parsed.get("seek_max_age")
    seek_place = parsed.get("seek_place")
    hide = parsed.get("hide_tags")
    if seek_min is None:
        seek_min = int(me["seek_min_age"] or 18) if "seek_min_age" in me_keys else 18
    if seek_max is None:
        seek_max = int(me["seek_max_age"] or 99) if "seek_max_age" in me_keys else 99
    if seek_place is None:
        seek_place = str(me["seek_place"] or "") if "seek_place" in me_keys else ""
    if hide is None:
        hide = hide_tags_of(me)
    conn.execute(
        """
        UPDATE users SET name = ?, age = ?, city = ?, gender = ?, looking_for = ?, bio = ?,
            job = ?, intent = ?, height = ?, communication = ?,
            special_data_consent_at = ?, photo_rights_consent_at = ?,
            seek_min_age = ?, seek_max_age = ?, seek_place = ?, hide_tags = ?
        WHERE id = ?
        """,
        (
            parsed["name"],
            parsed["age"],
            parsed["city"],
            parsed["gender"],
            parsed["looking_for"],
            parsed["bio"],
            parsed["job"],
            parsed["intent"],
            parsed["height"],
            parsed["communication"],
            special_at,
            photo_at,
            seek_min,
            seek_max,
            seek_place,
            ",".join(hide or []),
            uid,
        ),
    )
    replace_tags(conn, uid, parsed["neuro"], parsed["vibe"])
    _replace_prompts(conn, uid, parsed["prompts"])
    if parsed.get("photo"):
        if not photo_at:
            return jsonify({"ok": False, "error": "подтверди, что загружаешь только свои фото"}), 400
        _attach_portrait(conn, uid, parsed["photo"])
        conn.execute("UPDATE photos SET is_primary = CASE WHEN path = ? THEN 1 ELSE 0 END WHERE user_id = ?", (parsed["photo"], uid))
        _sync_primary_photo(conn, uid)
    primary_id = data.get("primary_photo_id")
    if primary_id not in (None, ""):
        try:
            pid = int(primary_id)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "не то фото"}), 400
        photo = conn.execute("SELECT id FROM photos WHERE id = ? AND user_id = ?", (pid, uid)).fetchone()
        if not photo:
            return jsonify({"ok": False, "error": "фото не найдено"}), 404
        conn.execute("UPDATE photos SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE user_id = ?", (pid, uid))
        _sync_primary_photo(conn, uid)
    if not draft:
        maybe_finish_onboard(conn, uid)
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return jsonify({"ok": True, "user": user_public(row, include_email=True, detail=True), "draft": draft})


@app.patch("/api/notifications")
@login_required
def api_patch_notifications():
    data = request.get_json(silent=True) or {}
    uid = session["uid"]
    conn = db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not row:
        return jsonify({"ok": False, "error": "нет профиля"}), 401
    keys = set(row.keys())
    enabled = int(row["notify_enabled"] or 1) if "notify_enabled" in keys else 1
    push = int(row["notify_push"] or 1) if "notify_push" in keys else 1
    if "enabled" in data:
        enabled = 1 if data.get("enabled") else 0
    if "push" in data:
        push = 1 if data.get("push") else 0
    if not enabled:
        push = 0
    conn.execute("UPDATE users SET notify_enabled = ?, notify_push = ? WHERE id = ?", (enabled, push, uid))
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return jsonify({"ok": True, "user": user_public(row, include_email=True, detail=True)})


def _eligible_card(
    me: Row,
    row: Row,
    neuro_filter: list[str],
    vibe_filter: list[str],
    blocked: set[int],
    *,
    skip_seeds: bool = False,
    snoozed: set[int] | None = None,
    liked_me: set[int] | None = None,
) -> dict[str, Any] | None:
    if row["id"] in blocked:
        return None
    if snoozed and row["id"] in snoozed:
        return None
    if is_guest_email(str(row["email"])):
        return None
    keys = set(row.keys())
    if "deleted_at" in keys and row["deleted_at"]:
        return None
    if "paused" in keys and int(row["paused"] or 0):
        return None
    if int(row["is_seed"] or 0) if "is_seed" in keys else 0:
        return None
    if skip_seeds and not is_live_profile(row):
        # legacy real-only flag: still hide @example.com / demo when asked
        return None
    if "incognito" in keys and int(row["incognito"] or 0):
        if not liked_me or row["id"] not in liked_me:
            return None
    if not mutual_looking_ok(
        str(me["looking_for"] or "everyone"),
        str(me["gender"] or ""),
        str(row["looking_for"] or "everyone"),
        str(row["gender"] or ""),
    ):
        return None
    if not discovery_allows(row, me):
        return None
    if not int(row["is_seed"] or 0) and not profile_complete(row):
        return None
    if not photos_for(row["id"]) and not str(row["photo"] or "").strip():
        return None
    card = user_public(row)
    if neuro_filter and not set(neuro_filter) & set(card["neuro"]):
        return None
    if vibe_filter and not set(vibe_filter) & set(card["vibe"]):
        return None
    return card


@app.get("/api/feed")
@login_required
def api_feed():
    me = db().execute("SELECT * FROM users WHERE id = ?", (session["uid"],)).fetchone()
    if not me:
        return jsonify({"ok": False, "error": "нет профиля"}), 401
    neuro_filter = [t for t in request.args.get("neuro", "").split(",") if t in NEURO_IDS]
    vibe_filter = [t for t in request.args.get("vibe", "").split(",") if t in VIBE_IDS]
    intent_filter = [t for t in request.args.get("intent", "").split(",") if t in INTENT_IDS]
    min_age = request.args.get("min_age", type=int) or 18
    max_age = request.args.get("max_age", type=int) or 99
    city_q = normalize_city(str(request.args.get("city") or "").strip())
    real_only = str(request.args.get("real") or "") in {"1", "true", "yes"}
    min_age = max(18, min(99, min_age))
    max_age = max(18, min(99, max_age))
    if min_age > max_age:
        min_age, max_age = max_age, min_age
    if not is_guest_email(str(me["email"])) and not int(me["is_seed"] or 0):
        track_filters(
            db(),
            user_id=int(me["id"]),
            source="feed",
            neuro=neuro_filter,
            vibe=vibe_filter,
            intents=intent_filter,
            city=city_q,
            min_age=min_age,
            max_age=max_age,
            real_only=real_only,
        )
    blocked = blocked_ids(db(), me["id"])
    # Seeds are wiped; real_only remains for hiding @example.com test/demo rows if asked.
    skip_seeds = bool(real_only and is_premium(me))
    hidden = snoozed_ids(db(), me["id"]) if is_premium(me) else set()
    liked_me = {
        int(r["from_id"])
        for r in db().execute(
            "SELECT from_id FROM swipes WHERE to_id = ? AND direction = 'like'",
            (me["id"],),
        )
    }
    limit = max(1, min(30, request.args.get("limit", type=int) or 30))

    def eligible(row):
        if intent_filter and not any(i in intent_filter for i in intents_of(row)):
            return None
        return _eligible_card(me, row, neuro_filter, vibe_filter, blocked,
                              skip_seeds=skip_seeds, snoozed=hidden, liked_me=liked_me)

    cards, has_more, generation = claim_feed(db(), int(me["id"]), min_age=min_age, max_age=max_age,
                                 city=city_q, limit=limit, eligible=eligible)
    jev_ranked = False
    jev_scores = "none"
    jev_allowed, jev_configured = jev_access(int(me["id"]))
    if (
        jev_allowed
        and not is_guest_email(str(me["email"]))
        and not int(me["is_seed"] or 0)
        and int(me["jev_feed_enabled"] or 0)
        and cards
    ):
        viewer_tags = tags_for(int(me["id"]))
        viewer_for_jev = {
            "id": int(me["id"]),
            "age": me["age"],
            "city": me["city"],
            "intent": me["intent"] if "intent" in set(me.keys()) else "dating",
            "intents": intents_of(me),
            "neuro": viewer_tags["neuro"],
            "vibe": viewer_tags["vibe"],
        }
        cards, jev_ranked, jev_scores = prepare_jev_feed(viewer_for_jev, cards)
    liked = db().execute(
        "SELECT COUNT(*) AS n FROM swipes WHERE from_id = ? AND direction = 'like'",
        (me["id"],),
    ).fetchone()["n"]
    passed_n = db().execute(
        "SELECT COUNT(*) AS n FROM swipes WHERE from_id = ? AND direction = 'pass'",
        (me["id"],),
    ).fetchone()["n"]
    db().commit()
    response = jsonify(
        {
            "ok": True,
            "cards": cards,
            "has_more": has_more,
            "generation": generation,
            "recycled": False,
            "jev_ranked": jev_ranked,
            "jev_scores": jev_scores,
            "unseen": len(cards),
            "passed": int(passed_n),
            "liked": int(liked),
            **inbox_stats(me["id"]),
        }
    )

    response.headers["Cache-Control"] = "no-store"
    return response


@app.post("/api/feed/view")
@login_required
def api_feed_view():
    data = request.get_json(silent=True) or {}
    try:
        target_id = int(data.get("target_id"))
    except (ValueError, TypeError):
        return jsonify({"ok": False, "error": "нет цели"}), 400
    if not mark_viewed(db(), session["uid"], target_id):
        return jsonify({"ok": False, "error": "анкета не выдавалась"}), 404
    db().commit()
    return jsonify({"ok": True})


@app.post("/api/feed/reset")
@login_required
def api_feed_reset():
    data = request.get_json(silent=True) or {}
    generation = data.get("generation") if isinstance(data, dict) else None
    if type(generation) is not int or generation < 0:
        return jsonify({"ok": False, "error": "неверная версия ленты"}), 400
    conn = db()
    viewer = conn.execute("SELECT * FROM users WHERE id = ? FOR UPDATE", (session["uid"],)).fetchone()
    if not is_premium(viewer):
        return jsonify({"ok": False, "error": "доступно только с WIRING+"}), 403
    reset, generation = reset_delivery(conn, viewer, generation)
    conn.commit()
    return jsonify({"ok": True, "reset": reset, "generation": generation})


@app.post("/api/swipe")
@login_required
def api_swipe():
    data = request.get_json(silent=True) or {}
    try:
        target_id = int(data.get("target_id"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "нет цели"}), 400
    direction = str(data.get("direction") or "")
    if direction not in {"like", "pass", "snooze"}:
        return jsonify({"ok": False, "error": "like, pass или snooze"}), 400
    uid = session["uid"]
    if target_id == uid:
        return jsonify({"ok": False, "error": "это ты"}), 400
    conn = db()
    if target_id in blocked_ids(conn, uid):
        return jsonify({"ok": False, "error": "этот человек скрыт"}), 403
    target = conn.execute("SELECT * FROM users WHERE id = ?", (target_id,)).fetchone()
    if not target or ("deleted_at" in target.keys() and target["deleted_at"]):
        return jsonify({"ok": False, "error": "человек не найден"}), 404
    me_row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if direction == "snooze":
        if not is_premium(me_row):
            return jsonify({"ok": False, "error": "отложить — это WIRING+", "need_plus": True}), 403
        until = snooze(conn, uid, target_id)
        conn.commit()
        return jsonify({"ok": True, "matched": False, "match": None, "snoozed_until": until})
    # Accidental pass/rewind on a mutual like used to wipe the match and lock the chat.
    if direction == "pass" and _is_match(conn, uid, target_id):
        return jsonify(
            {
                "ok": False,
                "error": "это уже взаимный лайк — убрать можно только из чата",
                "matched": True,
                "match": user_public(target),
            }
        ), 409
    if direction == "pass":
        exclude_profile(conn, uid, target_id)
    prev = conn.execute(
        "SELECT direction FROM swipes WHERE from_id = ? AND to_id = ?",
        (uid, target_id),
    ).fetchone()
    conn.execute(
        """
        INSERT INTO swipes (from_id, to_id, direction, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(from_id, to_id) DO UPDATE SET direction = excluded.direction, created_at = excluded.created_at
        """,
        (uid, target_id, direction, int(time.time())),
    )
    conn.commit()
    matched = False
    if direction == "like":
        back = conn.execute(
            "SELECT direction FROM swipes WHERE from_id = ? AND to_id = ?",
            (target_id, uid),
        ).fetchone()
        if back and back["direction"] == "like":
            matched = True
        elif int(target["is_seed"]) and not back:
            seed = pack_profile(target, tags_for(target_id), prompts_for(target_id))
            cand = pack_profile(me_row, tags_for(uid), prompts_for(uid))
            seed_dir = "like" if seed_decides_like(seed, cand) else "pass"
            conn.execute(
                """
                INSERT INTO swipes (from_id, to_id, direction, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(from_id, to_id) DO UPDATE SET direction = excluded.direction, created_at = excluded.created_at
                """,
                (target_id, uid, seed_dir, int(time.time())),
            )
            matched = seed_dir == "like"
        # Fresh mutual like (not a re-tap on an existing match) → notify.
        was_match = bool(prev and prev["direction"] == "like" and back and back["direction"] == "like")
        if matched:
            if not was_match:
                if _notifiable(me_row):
                    notify_event(
                        conn,
                        user_id=uid,
                        email=str(me_row["email"]),
                        is_guest=False,
                        kind="match",
                        from_id=target_id,
                        from_name=str(target["name"]),
                        last_seen=int(me_row["last_seen"] or 0) if "last_seen" in me_row.keys() else 0,
                    )
                if _notifiable(target):
                    notify_event(
                        conn,
                        user_id=target_id,
                        email=str(target["email"]),
                        is_guest=False,
                        kind="match",
                        from_id=uid,
                        from_name=str(me_row["name"]),
                        last_seen=int(target["last_seen"] or 0) if "last_seen" in target.keys() else 0,
                    )
        elif not int(target["is_seed"]) and _notifiable(target):
            notify_event(
                conn,
                user_id=target_id,
                email=str(target["email"]),
                is_guest=False,
                kind="like",
                from_id=uid,
                from_name=str(me_row["name"]),
                last_seen=int(target["last_seen"] or 0) if "last_seen" in target.keys() else 0,
            )
        conn.commit()
    liked = conn.execute(
        "SELECT COUNT(*) AS n FROM swipes WHERE from_id = ? AND direction = 'like'",
        (uid,),
    ).fetchone()["n"]
    return jsonify(
        {
            "ok": True,
            "matched": matched,
            "match": user_public(target) if matched else None,
            "guest_nudge": bool(is_guest_email(str(me_row["email"])) and liked >= 3),
        }
    )


@app.post("/api/rewind")
@login_required
def api_rewind():
    uid = session["uid"]
    conn = db()
    last = conn.execute(
        "SELECT to_id, direction, created_at FROM swipes WHERE from_id = ? ORDER BY created_at DESC, to_id DESC LIMIT 1",
        (uid,),
    ).fetchone()
    parked = last_snooze(conn, uid)
    if parked and (not last or int(parked["created_at"]) >= int(last["created_at"])):
        target = conn.execute("SELECT * FROM users WHERE id = ?", (parked["other_id"],)).fetchone()
        unsnooze(conn, uid, int(parked["other_id"]))
        conn.commit()
        return jsonify({"ok": True, "card": user_public(target) if target else None, "undid": "snooze"})
    if not last:
        return jsonify({"ok": False, "error": "нечего возвращать"}), 404
    if last["direction"] == "pass":
        return jsonify({"ok": False, "error": "исключённые анкеты не возвращаются"}), 409
    if last["direction"] == "like" and _is_match(conn, uid, int(last["to_id"])):
        return jsonify(
            {"ok": False, "error": "это уже взаимный лайк — убрать можно только из чата"}
        ), 409
    target = conn.execute("SELECT * FROM users WHERE id = ?", (last["to_id"],)).fetchone()
    _clear_pair(conn, uid, last["to_id"])
    conn.commit()
    return jsonify({"ok": True, "card": user_public(target) if target else None, "undid": last["direction"]})


@app.post("/api/deck/restart")
@login_required
def api_deck_restart():
    """Compatibility response for older clients: permanent exclusions cannot reset."""
    return jsonify({"ok": False, "error": "исключённые анкеты не возвращаются"}), 410


@app.get("/api/people/<int:other_id>")
@login_required
def api_person(other_id: int):
    uid = session["uid"]
    conn = db()
    if other_id != uid and other_id in blocked_ids(conn, uid):
        return jsonify({"ok": False, "error": "этот человек скрыт"}), 404
    row = conn.execute("SELECT * FROM users WHERE id = ?", (other_id,)).fetchone()
    if not row or ("deleted_at" in row.keys() and row["deleted_at"]) or (other_id != uid and is_guest_email(str(row["email"]))):
        return jsonify({"ok": False, "error": "человек не найден"}), 404
    payload = user_public(row, include_email=(other_id == uid), detail=True)
    payload["matched"] = other_id != uid and _is_match(conn, uid, other_id)
    liked_you = bool(
        conn.execute(
            "SELECT 1 FROM swipes WHERE from_id = ? AND to_id = ? AND direction = 'like'",
            (other_id, uid),
        ).fetchone()
    )
    you_liked = bool(
        conn.execute(
            "SELECT 1 FROM swipes WHERE from_id = ? AND to_id = ? AND direction = 'like'",
            (uid, other_id),
        ).fetchone()
    )
    payload["liked_you"] = liked_you and other_id != uid
    payload["you_liked"] = you_liked and other_id != uid
    return jsonify({"ok": True, "person": payload})


@app.get("/api/likes")
@login_required
def api_likes():
    uid = session["uid"]
    conn = db()
    blocked = blocked_ids(conn, uid)
    neuro_filter = [t for t in request.args.get("neuro", "").split(",") if t in NEURO_IDS]
    vibe_filter = [t for t in request.args.get("vibe", "").split(",") if t in VIBE_IDS]
    intent_filter = [t for t in request.args.get("intent", "").split(",") if t in INTENT_IDS]
    min_age = request.args.get("min_age", type=int) or 18
    max_age = request.args.get("max_age", type=int) or 99
    city_q = normalize_city(str(request.args.get("city") or "").strip())
    min_age = max(18, min(99, min_age))
    max_age = max(18, min(99, max_age))
    if min_age > max_age:
        min_age, max_age = max_age, min_age
    me = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if me and not is_guest_email(str(me["email"])) and not int(me["is_seed"] or 0):
        track_filters(
            conn,
            user_id=uid,
            source="likes",
            neuro=neuro_filter,
            vibe=vibe_filter,
            intents=intent_filter,
            city=city_q,
            min_age=min_age,
            max_age=max_age,
        )
    # Only unanswered inbound likes. Mutual → Чаты; pass → gone from likes.
    rows = conn.execute(
        """
        SELECT u.* FROM users u
        JOIN swipes s ON s.from_id = u.id AND s.to_id = ? AND s.direction = 'like'
        WHERE u.age BETWEEN ? AND ?
          AND (? = '' OR u.city = ?)
          AND COALESCE(u.is_seed, 0) = 0
          AND COALESCE(u.deleted_at, 0) = 0
          AND u.id NOT IN (SELECT to_id FROM swipes WHERE from_id = ?)
          AND (
            EXISTS (SELECT 1 FROM photos p WHERE p.user_id = u.id)
            OR (u.photo IS NOT NULL AND u.photo != '')
          )
        ORDER BY s.created_at DESC
        """,
        (uid, min_age, max_age, city_q, city_q, uid),
    ).fetchall()
    plus = is_premium(me)
    people = []
    for row in rows:
        if row["id"] in blocked or is_guest_email(str(row["email"])):
            continue
        if neuro_filter or vibe_filter:
            tags = tags_for(row["id"])
            if neuro_filter and not set(neuro_filter) & set(tags["neuro"]):
                continue
            if vibe_filter and not set(vibe_filter) & set(tags["vibe"]):
                continue
        if intent_filter and not any(i in intent_filter for i in intents_of(row)):
            continue
        if plus:
            item = user_public(row, detail=True)
            item["matched"] = False
            people.append(item)
        else:
            people.append({"hidden": True, "matched": False})
    return jsonify({"ok": True, "likes": people, "plus": plus})


@app.get("/api/matches")
@login_required
def api_matches():
    uid = session["uid"]
    conn = db()
    blocked = blocked_ids(conn, uid)
    rows = conn.execute(
        """
        SELECT u.*,
               CASE WHEN a.created_at > b.created_at THEN a.created_at ELSE b.created_at END AS matched_at
        FROM users u
        JOIN swipes a ON a.to_id = u.id AND a.from_id = ? AND a.direction = 'like'
        JOIN swipes b ON b.from_id = u.id AND b.to_id = ? AND b.direction = 'like'
        WHERE COALESCE(u.deleted_at, 0) = 0
        """,
        (uid, uid),
    ).fetchall()
    matches = []
    for row in rows:
        if row["id"] in blocked:
            continue
        item = user_public(row)
        matched_at = int(row["matched_at"] or 0)
        last = conn.execute(
            """
            SELECT body, photo, from_id, created_at, id FROM messages
            WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))
              AND COALESCE(deleted_at, 0) = 0
            ORDER BY id DESC LIMIT 1
            """,
            (uid, row["id"], row["id"], uid),
        ).fetchone()
        body = str(last["body"] or "").strip() if last else ""
        has_photo = bool(last and str(last["photo"] or "").strip()) if last else False
        if last and not body and has_photo:
            preview = "фото"
        elif last and body and has_photo:
            preview = body
        else:
            preview = body
        item["last_message"] = preview
        item["last_at"] = last["created_at"] if last else 0
        item["last_from_id"] = last["from_id"] if last else 0
        item["matched_at"] = matched_at
        item["unread"] = unread_count(conn, uid, row["id"])
        matches.append(item)
    # Newest activity on top: last message, or match time if чат ещё пустой.
    matches.sort(
        key=lambda item: (
            max(int(item.get("last_at") or 0), int(item.get("matched_at") or 0)),
            int(item.get("matched_at") or 0),
            int(item.get("id") or 0),
        ),
        reverse=True,
    )
    return jsonify({"ok": True, "matches": matches})



def _message_preview(body: str, photo: str = "") -> str:
    text_body = str(body or "").strip()
    if text_body:
        return text_body[:160]
    if str(photo or "").strip():
        return "фото"
    return ""


def _message_payload(
    row: Row,
    uid: int,
    peer_read_id: int = 0,
    by_id: dict[int, Row] | None = None,
) -> dict[str, Any]:
    keys = set(row.keys())
    photo = str(row["photo"] or "") if "photo" in keys else ""
    body = str(row["body"] or "")
    reply_to = None
    reply_id = row["reply_to_id"] if "reply_to_id" in keys else None
    if reply_id and by_id and int(reply_id) in by_id:
        src = by_id[int(reply_id)]
        src_keys = set(src.keys())
        src_photo = str(src["photo"] or "") if "photo" in src_keys else ""
        reply_to = {
            "id": int(src["id"]),
            "body": _message_preview(str(src["body"] or ""), src_photo),
            "mine": src["from_id"] == uid,
            "has_photo": bool(src_photo),
        }
    return {
        "id": row["id"],
        "from_id": row["from_id"],
        "mine": row["from_id"] == uid,
        "body": body,
        "photo": photo,
        "photo_url": prefix(f"/api/messages/media/{row['id']}") if photo else "",
        "created_at": row["created_at"],
        "read": row["from_id"] == uid and int(row["id"]) <= peer_read_id,
        "reply_to": reply_to,
    }


def _insert_message(
    conn: Connection,
    *,
    uid: int,
    other_id: int,
    body: str,
    photo: str = "",
    reply_to_id: int | None = None,
) -> int:
    cur = conn.execute(
        """
        INSERT INTO messages (from_id, to_id, body, created_at, reply_to_id, photo)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (uid, other_id, body, int(time.time()), reply_to_id, photo or ""),
    )
    return int(cur.lastrowid)


@app.get("/api/messages/<int:other_id>")
@login_required
def api_messages(other_id: int):
    uid = session["uid"]
    conn = db()
    if other_id in blocked_ids(conn, uid):
        return jsonify({"ok": False, "error": "этот человек скрыт"}), 403
    if not _is_match(conn, uid, other_id):
        return jsonify({"ok": False, "error": "написать можно после взаимного лайка"}), 403
    other = conn.execute("SELECT * FROM users WHERE id = ?", (other_id,)).fetchone()
    if not other or ("deleted_at" in other.keys() and other["deleted_at"]):
        return jsonify({"ok": False, "error": "человек не найден"}), 404
    rows = conn.execute(
        """
        SELECT id, from_id, to_id, body, created_at, reply_to_id, photo FROM messages
        WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))
          AND COALESCE(deleted_at, 0) = 0
        ORDER BY id ASC
        """,
        (uid, other_id, other_id, uid),
    ).fetchall()
    mark_read(conn, uid, other_id)
    conn.execute(
        "UPDATE notifications SET read = 1 WHERE user_id = ? AND from_id = ? AND kind = 'message' AND read = 0",
        (uid, other_id),
    )
    conn.commit()
    peer_read = conn.execute(
        "SELECT last_read_id FROM reads WHERE user_id = ? AND other_id = ? AND COALESCE(deleted_at, 0) = 0",
        (other_id, uid),
    ).fetchone()
    peer_read_id = int(peer_read["last_read_id"]) if peer_read else 0
    by_id = {int(r["id"]): r for r in rows}
    messages = [_message_payload(r, uid, peer_read_id, by_id) for r in rows]
    peer = user_public(other, detail=True)
    me_row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    me = user_public(me_row, detail=True) if me_row else None
    openers = cached_openers(conn, uid, other_id, peer, me) if not messages else []
    return jsonify(
        {
            "ok": True,
            "peer": peer,
            "messages": messages,
            "openers": openers,
        }
    )


@app.post("/api/messages")
@login_required
def api_send_message():
    uid = session["uid"]
    data = request.get_json(silent=True) or {}
    try:
        other_id = int(data.get("to_id"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "нет адресата"}), 400
    body = str(data.get("body") or "").strip()
    if not (1 <= len(body) <= 1000):
        return jsonify({"ok": False, "error": "сообщение: 1–1000 символов"}), 400
    conn = db()
    if other_id in blocked_ids(conn, uid):
        return jsonify({"ok": False, "error": "этот человек скрыт"}), 403
    if not _is_match(conn, uid, other_id):
        return jsonify({"ok": False, "error": "написать можно после взаимного лайка"}), 403
    sender = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    other = conn.execute("SELECT * FROM users WHERE id = ?", (other_id,)).fetchone()
    if not other or ("deleted_at" in other.keys() and other["deleted_at"]):
        return jsonify({"ok": False, "error": "человек не найден"}), 404
    reply_to_id = None
    raw_reply = data.get("reply_to_id")
    if raw_reply not in (None, "", 0, "0"):
        try:
            reply_to_id = int(raw_reply)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "некорректный ответ"}), 400
        src = conn.execute(
            """
            SELECT id FROM messages
            WHERE id = ? AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))
            """,
            (reply_to_id, uid, other_id, other_id, uid),
        ).fetchone()
        if not src:
            return jsonify({"ok": False, "error": "сообщение для ответа не найдено"}), 400
    _insert_message(conn, uid=uid, other_id=other_id, body=body, reply_to_id=reply_to_id)
    mark_read(conn, uid, other_id)
    if sender and other and _notifiable(other):
        notify_event(
            conn,
            user_id=other_id,
            email=str(other["email"]),
            is_guest=False,
            kind="message",
            from_id=uid,
            from_name=str(sender["name"]),
            preview=body,
            last_seen=int(other["last_seen"] or 0) if "last_seen" in other.keys() else 0,
        )
    conn.commit()
    return jsonify({"ok": True})


@app.post("/api/messages/photo")
@login_required
@real_account_required
def api_send_photo_message():
    uid = session["uid"]
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "x").split(",")[0].strip()
    if too_many(f"chatphoto:{ip}", 40, 3600):
        return jsonify({"ok": False, "error": "слишком много фото, подожди"}), 429
    try:
        other_id = int(request.form.get("to_id") or 0)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "нет адресата"}), 400
    if not other_id:
        return jsonify({"ok": False, "error": "нет адресата"}), 400
    caption = str(request.form.get("body") or "").strip()[:500]
    conn = db()
    if other_id in blocked_ids(conn, uid):
        return jsonify({"ok": False, "error": "этот человек скрыт"}), 403
    if not _is_match(conn, uid, other_id):
        return jsonify({"ok": False, "error": "написать можно после взаимного лайка"}), 403
    sender = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    other = conn.execute("SELECT * FROM users WHERE id = ?", (other_id,)).fetchone()
    if not other or ("deleted_at" in other.keys() and other["deleted_at"]):
        return jsonify({"ok": False, "error": "человек не найден"}), 404
    reply_to_id = None
    raw_reply = request.form.get("reply_to_id")
    if raw_reply not in (None, "", 0, "0"):
        try:
            reply_to_id = int(raw_reply)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "некорректный ответ"}), 400
        src = conn.execute(
            """
            SELECT id FROM messages
            WHERE id = ? AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))
            """,
            (reply_to_id, uid, other_id, other_id, uid),
        ).fetchone()
        if not src:
            return jsonify({"ok": False, "error": "сообщение для ответа не найдено"}), 400
    try:
        jpeg = read_upload(request.files.get("file"))
        moderate_photo(jpeg)
    except MediaError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    folder = os.path.join(UPLOAD_DIR, "chat", str(uid))
    os.makedirs(folder, exist_ok=True)
    filename = f"{secrets.token_hex(16)}.jpg"
    rel = f"chat/{uid}/{filename}"
    with open(os.path.join(folder, filename), "wb") as handle:
        handle.write(jpeg)
    msg_id = _insert_message(
        conn,
        uid=uid,
        other_id=other_id,
        body=caption,
        photo=rel,
        reply_to_id=reply_to_id,
    )
    mark_read(conn, uid, other_id)
    if sender and other and _notifiable(other):
        notify_event(
            conn,
            user_id=other_id,
            email=str(other["email"]),
            is_guest=False,
            kind="message",
            from_id=uid,
            from_name=str(sender["name"]),
            preview=_message_preview(caption, rel),
            last_seen=int(other["last_seen"] or 0) if "last_seen" in other.keys() else 0,
        )
    conn.commit()
    return jsonify({"ok": True, "id": msg_id})


@app.get("/api/messages/media/<int:message_id>")
@login_required
def api_message_media(message_id: int):
    uid = session["uid"]
    conn = db()
    row = conn.execute("SELECT * FROM messages WHERE id = ?", (message_id,)).fetchone()
    if not row or ("deleted_at" in row.keys() and row["deleted_at"]):
        abort(404)
    from_id = int(row["from_id"])
    to_id = int(row["to_id"])
    if uid not in {from_id, to_id}:
        abort(403)
    other = to_id if uid == from_id else from_id
    if other in blocked_ids(conn, uid):
        abort(403)
    photo = str(row["photo"] or "") if "photo" in row.keys() else ""
    if not photo:
        abort(404)
    if request.args.get("s") == "sm":
        return _send_thumb(UPLOAD_DIR, photo, "chat")
    _safe_media_path(UPLOAD_DIR, photo)
    response = send_from_directory(UPLOAD_DIR, photo)
    response.headers["Cache-Control"] = "private, max-age=86400"
    return response


@app.post("/api/unmatch")
@login_required
def api_unmatch():
    uid = session["uid"]
    data = request.get_json(silent=True) or {}
    try:
        other_id = int(data.get("user_id"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "нет человека"}), 400
    conn = db()
    if not _is_match(conn, uid, other_id):
        return jsonify({"ok": False, "error": "размэтч возможен только после взаимного лайка"}), 400
    _unmatch_pair(conn, uid, other_id)
    conn.commit()
    return jsonify({"ok": True})


@app.post("/api/block")
@login_required
def api_block():
    uid = session["uid"]
    data = request.get_json(silent=True) or {}
    try:
        other_id = int(data.get("user_id"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "нет человека"}), 400
    if other_id == uid:
        return jsonify({"ok": False, "error": "это ты"}), 400
    conn = db()
    if not conn.execute("SELECT id FROM users WHERE id = ?", (other_id,)).fetchone():
        return jsonify({"ok": False, "error": "человек не найден"}), 404
    conn.execute(
        "INSERT INTO blocks (from_id, to_id, created_at) VALUES (?, ?, ?) ON CONFLICT(from_id, to_id) DO NOTHING",
        (uid, other_id, int(time.time())),
    )
    _unmatch_pair(conn, uid, other_id)
    conn.commit()
    return jsonify({"ok": True})


@app.post("/api/report")
@login_required
def api_report():
    uid = session["uid"]
    data = request.get_json(silent=True) or {}
    try:
        other_id = int(data.get("user_id"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "нет человека"}), 400
    reason = str(data.get("reason") or "").strip()
    details = str(data.get("details") or "").strip()[:500]
    if reason not in REPORT_IDS:
        return jsonify({"ok": False, "error": "выбери причину"}), 400
    if other_id == uid:
        return jsonify({"ok": False, "error": "это ты"}), 400
    conn = db()
    if not conn.execute("SELECT id FROM users WHERE id = ?", (other_id,)).fetchone():
        return jsonify({"ok": False, "error": "человек не найден"}), 404
    conn.execute(
        "INSERT INTO reports (from_id, to_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?)",
        (uid, other_id, reason, details, int(time.time())),
    )
    conn.execute(
        "INSERT INTO blocks (from_id, to_id, created_at) VALUES (?, ?, ?) ON CONFLICT(from_id, to_id) DO NOTHING",
        (uid, other_id, int(time.time())),
    )
    _unmatch_pair(conn, uid, other_id)
    conn.commit()
    return jsonify({"ok": True})


@app.get("/api/albums")
@login_required
def api_albums():
    return jsonify({"ok": True, "albums": albums_for(session["uid"])})


@app.post("/api/albums")
@login_required
@real_account_required
def api_create_album():
    return jsonify({"ok": False, "error": "один набор фото, без альбомов"}), 400


@app.patch("/api/albums/<int:album_id>")
@login_required
@real_account_required
def api_rename_album(album_id: int):
    uid = session["uid"]
    data = request.get_json(silent=True) or {}
    title = str(data.get("title") or "").strip()[:32]
    if len(title) < 1:
        return jsonify({"ok": False, "error": "нужно название"}), 400
    conn = db()
    row = conn.execute("SELECT id FROM albums WHERE id = ? AND user_id = ?", (album_id, uid)).fetchone()
    if not row:
        return jsonify({"ok": False, "error": "альбом не найден"}), 404
    conn.execute("UPDATE albums SET title = ? WHERE id = ?", (title, album_id))
    conn.commit()
    return jsonify({"ok": True, "albums": albums_for(uid)})


@app.delete("/api/albums/<int:album_id>")
@login_required
@real_account_required
def api_delete_album(album_id: int):
    uid = session["uid"]
    conn = db()
    row = conn.execute("SELECT id FROM albums WHERE id = ? AND user_id = ?", (album_id, uid)).fetchone()
    if not row:
        return jsonify({"ok": False, "error": "альбом не найден"}), 404
    fallback = _album_id(conn, uid, "я")
    if fallback == album_id:
        other = conn.execute(
            "SELECT id FROM albums WHERE user_id = ? AND id != ? ORDER BY id LIMIT 1",
            (uid, album_id),
        ).fetchone()
        fallback = int(other["id"]) if other else None
    if fallback:
        conn.execute("UPDATE photos SET album_id = ? WHERE user_id = ? AND album_id = ?", (fallback, uid, album_id))
    else:
        conn.execute("UPDATE photos SET album_id = NULL WHERE user_id = ? AND album_id = ?", (uid, album_id))
    conn.execute("DELETE FROM albums WHERE id = ?", (album_id,))
    conn.commit()
    return jsonify({"ok": True, "albums": albums_for(uid)})


@app.post("/api/photos")
@login_required
@real_account_required
def api_upload_photo():
    uid = session["uid"]
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "x").split(",")[0].strip()
    if too_many(f"photo:{ip}", 40, 3600):
        return jsonify({"ok": False, "error": "слишком много загрузок, подожди"}), 429
    conn = db()
    me = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    photo_at = me["photo_rights_consent_at"] if me and "photo_rights_consent_at" in me.keys() else None
    if not photo_at:
        flag = str(request.form.get("photo_rights_consent") or "").lower()
        if flag in {"1", "true", "yes", "on"}:
            photo_at = int(time.time())
            conn.execute("UPDATE users SET photo_rights_consent_at = ? WHERE id = ?", (photo_at, uid))
        else:
            return jsonify({
                "ok": False,
                "error": "отметь галочку «Загружаю только свои фото» в блоке «Фото» и попробуй снова",
            }), 400
    count = conn.execute("SELECT COUNT(*) AS n FROM photos WHERE user_id = ?", (uid,)).fetchone()["n"]
    if count >= MAX_PHOTOS:
        return jsonify({"ok": False, "error": f"не больше {MAX_PHOTOS} фото"}), 400
    try:
        jpeg = read_upload(request.files.get("file"))
        moderate_photo(jpeg)
    except MediaError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    album_id_raw = request.form.get("album_id") or (request.get_json(silent=True) or {}).get("album_id")
    album_title = (request.form.get("album") or "").strip()[:32]
    album_id = None
    if album_id_raw:
        try:
            album_id = int(album_id_raw)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "не тот альбом"}), 400
        if not conn.execute("SELECT id FROM albums WHERE id = ? AND user_id = ?", (album_id, uid)).fetchone():
            return jsonify({"ok": False, "error": "альбом не найден"}), 404
    if album_id is None:
        album_id = _album_id(conn, uid, album_title or "я")
    folder = os.path.join(UPLOAD_DIR, str(uid))
    os.makedirs(folder, exist_ok=True)
    filename = f"{secrets.token_hex(16)}.jpg"
    rel = f"{uid}/{filename}"
    with open(os.path.join(folder, filename), "wb") as handle:
        handle.write(jpeg)
    is_primary = 1 if count == 0 else 0
    cur = conn.execute(
        """
        INSERT INTO photos (user_id, album_id, path, is_primary, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (uid, album_id, rel, is_primary, int(count), int(time.time())),
    )
    _sync_primary_photo(conn, uid)
    maybe_finish_onboard(conn, uid)
    conn.commit()
    photo_id = int(cur.lastrowid)
    photos = photos_for(uid)
    item = next((p for p in photos if p["id"] == photo_id), None)
    return jsonify({"ok": True, "photo": item, "photos": photos, "albums": albums_for(uid)})


@app.patch("/api/photos/<int:photo_id>")
@login_required
@real_account_required
def api_patch_photo(photo_id: int):
    uid = session["uid"]
    data = request.get_json(silent=True) or {}
    conn = db()
    row = conn.execute("SELECT * FROM photos WHERE id = ? AND user_id = ?", (photo_id, uid)).fetchone()
    if not row:
        return jsonify({"ok": False, "error": "фото не найдено"}), 404
    if "album_id" in data and data["album_id"] is not None:
        try:
            album_id = int(data["album_id"])
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "не тот альбом"}), 400
        if not conn.execute("SELECT id FROM albums WHERE id = ? AND user_id = ?", (album_id, uid)).fetchone():
            return jsonify({"ok": False, "error": "альбом не найден"}), 404
        conn.execute("UPDATE photos SET album_id = ? WHERE id = ?", (album_id, photo_id))
    if data.get("is_primary"):
        conn.execute("UPDATE photos SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE user_id = ?", (photo_id, uid))
        _sync_primary_photo(conn, uid)
    conn.commit()
    return jsonify({"ok": True, "photos": photos_for(uid), "albums": albums_for(uid)})


@app.delete("/api/photos/<int:photo_id>")
@login_required
@real_account_required
def api_delete_photo(photo_id: int):
    uid = session["uid"]
    conn = db()
    row = conn.execute("SELECT * FROM photos WHERE id = ? AND user_id = ?", (photo_id, uid)).fetchone()
    if not row:
        return jsonify({"ok": False, "error": "фото не найдено"}), 404
    remaining_n = conn.execute("SELECT COUNT(*) AS n FROM photos WHERE user_id = ?", (uid,)).fetchone()["n"]
    if remaining_n <= 1:
        return jsonify({"ok": False, "error": "нужно хотя бы одно фото"}), 400
    path = row["path"]
    conn.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
    if not str(path).startswith("portraits/"):
        full = os.path.join(UPLOAD_DIR, path)
        if os.path.isfile(full):
            os.remove(full)
    remaining = conn.execute("SELECT id FROM photos WHERE user_id = ? ORDER BY sort_order, id LIMIT 1", (uid,)).fetchone()
    if remaining:
        conn.execute("UPDATE photos SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE user_id = ?", (remaining["id"], uid))
    _sync_primary_photo(conn, uid)
    conn.commit()
    return jsonify({"ok": True, "photos": photos_for(uid), "albums": albums_for(uid)})


def _safe_media_path(root: str, filename: str) -> str:
    if ".." in filename or filename.startswith("/"):
        abort(404)
    full = os.path.abspath(os.path.join(root, filename))
    root_abs = os.path.abspath(root)
    if full != root_abs and not full.startswith(root_abs + os.sep):
        abort(404)
    if not os.path.isfile(full):
        abort(404)
    return full


def _send_thumb(root: str, filename: str, kind: str):
    source = _safe_media_path(root, filename)
    cache = os.path.join(THUMB_DIR, kind, filename)
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    if not os.path.isfile(cache) or os.path.getmtime(cache) < os.path.getmtime(source):
        with open(source, "rb") as fh:
            raw = fh.read()
        try:
            data = make_thumb(raw)
        except MediaError:
            return send_from_directory(root, filename)
        with open(cache, "wb") as fh:
            fh.write(data)
    response = send_file(cache, mimetype="image/jpeg", max_age=31536000)
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


@app.get("/media/<path:filename>")
def media_files(filename: str):
    if request.args.get("s") == "sm":
        return _send_thumb(UPLOAD_DIR, filename, "media")
    _safe_media_path(UPLOAD_DIR, filename)
    response = send_from_directory(UPLOAD_DIR, filename)
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


@app.get("/public/<path:filename>")
def public_files(filename: str):
    if request.args.get("s") == "sm":
        return _send_thumb(PUBLIC_DIR, filename, "public")
    return send_from_directory(PUBLIC_DIR, filename)


@app.patch("/api/plus")
@login_required
@real_account_required
def api_plus():
    uid = session["uid"]
    conn = db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not is_premium(row):
        return jsonify({"ok": False, "error": "это WIRING+", "need_plus": True}), 403
    data = request.get_json(silent=True) or {}
    incognito = row["incognito"]
    paused = row["paused"]
    if "incognito" in data:
        incognito = 1 if data.get("incognito") else 0
    if "paused" in data:
        paused = 1 if data.get("paused") else 0
    conn.execute("UPDATE users SET incognito = ?, paused = ? WHERE id = ?", (incognito, paused, uid))
    conn.commit()
    return jsonify({"ok": True, "user": current_user()})


@app.patch("/api/me/consents")
@login_required
def api_patch_me_consents():
    data = request.get_json(silent=True) or {}
    uid = session["uid"]
    conn = db()
    me = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not me:
        return jsonify({"ok": False, "error": "нет профиля"}), 401
    now = int(time.time())
    special_at = now if _consent_yes(data.get("special_data_consent")) else None
    photo_at = now if _consent_yes(data.get("photo_rights_consent")) else None
    conn.execute(
        "UPDATE users SET special_data_consent_at = ?, photo_rights_consent_at = ? WHERE id = ?",
        (special_at, photo_at, uid),
    )
    conn.commit()
    return jsonify({"ok": True, "user": current_user()})


@app.post("/api/premium/redeem")
@login_required
@real_account_required
def api_redeem():
    uid = session["uid"]
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "x").split(",")[0].strip()
    if too_many(f"promo:{ip}", 12, 3600):
        return jsonify({"ok": False, "error": "слишком много попыток"}), 429
    data = request.get_json(silent=True) or {}
    conn = db()
    until, err = redeem_code(conn, uid, str(data.get("code") or ""))
    if err:
        return jsonify({"ok": False, "error": err}), 400
    conn.commit()
    return jsonify({"ok": True, "user": current_user(), "plus_until": until})


@app.post("/api/onboard/skip")
@login_required
def api_onboard_skip():
    # Soft skip — profile can stay incomplete; feed still hides hollow cards.
    return jsonify({"ok": True, "user": current_user()})


@app.get("/api/inbox")
@login_required
def api_inbox():
    uid = session["uid"]
    return jsonify({"ok": True, **inbox_stats(uid), "notices": unread_notices(db(), uid)})


@app.post("/api/notices/read")
@login_required
def api_notices_read():
    data = request.get_json(silent=True) or {}
    raw_ids = data.get("ids")
    ids = None
    if isinstance(raw_ids, list):
        ids = []
        for item in raw_ids:
            try:
                ids.append(int(item))
            except (TypeError, ValueError):
                continue
    conn = db()
    mark_notices_read(conn, session["uid"], ids)
    conn.commit()
    return jsonify({"ok": True})


def _admin_tokens() -> tuple[str, ...]:
    raw = os.environ.get("ADMIN_TOKEN") or ""
    return tuple(dict.fromkeys(token.strip() for token in raw.split(",") if token.strip()))


def _local_admin_credentials() -> tuple[str, str]:
    """Return opt-in local admin credentials, never enabled on non-local requests."""
    login = (os.environ.get("LOCAL_ADMIN_LOGIN") or "").strip()
    password = os.environ.get("LOCAL_ADMIN_PASSWORD") or ""
    if not login or not password:
        return "", ""
    remote = (request.remote_addr or "").strip().lower()
    host = request.host.split(":", 1)[0].strip("[]").lower()
    debug = os.environ.get("FLASK_DEBUG") == "1" or app.debug or app.testing
    if not debug or remote not in {"127.0.0.1", "::1", "localhost"} or host not in {"127.0.0.1", "::1", "localhost"}:
        return "", ""
    return login, password


def _admin_auth_available() -> bool:
    return bool(_admin_tokens() or _local_admin_credentials()[0])


def _admin_ready() -> bool:
    return bool(_admin_auth_available() and session.get("admin"))


def _admin_tickets(conn: Connection) -> list[Row]:
    return conn.execute(
        """
        SELECT id, user_id, name, email, body, created_at
        FROM support_tickets
        ORDER BY id DESC
        LIMIT 40
        """
    ).fetchall()


def _admin_tasks(conn: Connection) -> list[Row]:
    return list_tasks(conn, limit=120)


def _admin_view(error: str | None = None, status: int = 200):
    conn = db()
    local_login, _ = _local_admin_credentials()
    return (
        render_template(
            "admin.html",
            authed=True,
            s=collect_stats(conn),
            codes=list_codes(conn),
            tickets=_admin_tickets(conn),
            tasks=_admin_tasks(conn),
            task_counts=task_counts(conn),
            task_threshold=task_threshold(),
            error=error,
            local_admin_login=local_login,
        ),
        status,
    )


@app.route("/admin", methods=["GET", "POST"])
def admin_page():
    tokens = _admin_tokens()
    local_login, local_password = _local_admin_credentials()
    if not tokens and not local_login:
        abort(404)
    if request.args.get("out"):
        session.pop("admin", None)
        return redirect("/admin")
    query_token = str(request.args.get("token") or "")
    if any(_token_ok(query_token, candidate) for candidate in tokens):
        session["admin"] = True
    error = None
    status = 200
    if request.method == "POST":
        ip = request.headers.get("X-Forwarded-For", request.remote_addr or "x").split(",")[0].strip()
        if too_many(f"admin:{ip}", 12, 3600):
            return render_template("admin.html", authed=False, s=None, codes=[], tickets=[], tasks=[], task_counts={}, task_threshold=task_threshold(), error="подожди немного", local_admin_login=local_login), 429
        submitted_token = str(request.form.get("token") or "")
        token_ok = any(_token_ok(submitted_token, token) for token in tokens)
        local_ok = bool(local_login and _token_ok(str(request.form.get("login") or ""), local_login)
                        and _token_ok(str(request.form.get("password") or ""), local_password))
        if token_ok or local_ok:
            session["admin"] = True
        else:
            error = "не тот токен или логин/пароль"
            status = 403
    if not session.get("admin"):
        return render_template("admin.html", authed=False, s=None, codes=[], tickets=[], tasks=[], task_counts={}, task_threshold=task_threshold(), error=error, local_admin_login=local_login), status
    return _admin_view()


@app.post("/admin/premium")
def admin_premium():
    if not _admin_ready():
        abort(403)
    who = str(request.form.get("who") or "").strip()
    try:
        days = int(request.form.get("days") or "30")
    except (TypeError, ValueError):
        return _admin_view("дни — число", 400)
    if not who:
        return _admin_view("укажи почту или id", 400)
    conn = db()
    row = None
    if who.isdigit():
        row = conn.execute("SELECT * FROM users WHERE id = ?", (int(who),)).fetchone()
    if row is None:
        row = conn.execute("SELECT * FROM users WHERE lower(email) = ?", (who.lower(),)).fetchone()
    if row is None:
        row = conn.execute("SELECT * FROM users WHERE name = ? AND is_seed = 0", (who,)).fetchone()
    if not row:
        return _admin_view("человека нет", 404)
    if is_guest_email(str(row["email"])) or int(row["is_seed"] or 0):
        return _admin_view("премиум только живым аккаунтам", 400)
    grant_premium(conn, int(row["id"]), days)
    conn.commit()
    return redirect("/admin")


@app.post("/admin/promo")
def admin_promo():
    if not _admin_ready():
        abort(403)
    try:
        days = int(request.form.get("days") or "90")
        max_uses = int(request.form.get("max_uses") or "0")
    except (TypeError, ValueError):
        return _admin_view("дни и лимит — числа", 400)
    err = add_code(db(), str(request.form.get("code") or ""), days, max_uses)
    if err:
        return _admin_view(err, 400)
    db().commit()
    return redirect("/admin")


@app.post("/admin/tasks/import-support")
def admin_tasks_import_support():
    """Backfill the triage board from messages already sent via /support."""
    if not _admin_ready():
        abort(403)
    conn = db()
    triage_support_tickets(conn)
    conn.commit()
    return redirect("/admin#tasks")


@app.post("/admin/tasks/<int:task_id>/decision")
def admin_task_decision(task_id: int):
    if not _admin_ready():
        abort(403)
    decision = str(request.form.get("decision") or "").strip().lower()
    if decision not in {"approved", "rejected", "done", "candidate"}:
        return _admin_view("неизвестное решение", 400)
    conn = db()
    row = conn.execute("SELECT id FROM feature_tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        return _admin_view("задача не найдена", 404)
    now = int(time.time())
    if decision == "approved":
        conn.execute(
            "UPDATE feature_tasks SET status = 'approved', approved_at = ?, approved_by = 'admin', updated_at = ? WHERE id = ?",
            (now, now, task_id),
        )
    else:
        conn.execute(
            "UPDATE feature_tasks SET status = ?, updated_at = ? WHERE id = ?",
            (decision, now, task_id),
        )
    conn.commit()
    return redirect("/admin#tasks")


@app.get("/privacy")
def privacy():
    return render_template(
        "legal.html",
        title="Конфиденциальность",
        description="Какие данные хранит WIRING и как их удалить.",
        path="/privacy",
        site_url=SITE_URL,
        body=PRIVACY_HTML,
    )


@app.get("/rules")
def rules():
    return render_template(
        "legal.html",
        title="Правила",
        description="Правила сообщества WIRING. 18+. Ограничения по законодательству РФ.",
        path="/rules",
        site_url=SITE_URL,
        body=RULES_HTML,
    )


@app.get("/glossary")
def glossary():
    return render_template(
        "legal.html",
        title="Особенности и аббревиатуры",
        description="Что значат ASD, ADHD, AuDHD, ПРЛ, RSD, PDA и остальные особенности на WIRING.",
        path="/glossary",
        site_url=SITE_URL,
        body=glossary_html(),
    )


@app.post("/support")
def support():
    me = current_user()
    notice = ""
    error = ""
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "x").split(",")[0].strip()
    data = request.get_json(silent=True) if request.is_json else request.form
    if not data:
        data = request.form
    if too_many(f"support:{ip}", 5, 3600):
        error = "слишком часто — подожди немного"
    else:
        body = str(data.get("body") or "").strip()
        name = str(data.get("name") or "").strip()
        email = str(data.get("email") or "").strip()
        if me:
            name = name or str(me.get("name") or "")
        if len(body) < 8:
            error = "напиши чуть подробнее"
        elif len(body) > 2000:
            error = "слишком длинно"
        elif email and not EMAIL_RE.match(email):
            error = "почта странная"
        else:
            uid = session.get("uid")
            conn = db()
            conn.execute(
                """
                INSERT INTO support_tickets (user_id, name, email, body, ip, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (uid, name[:80], email[:120], body[:2000], ip[:80], int(time.time())),
            )
            conn.commit()
            who = name or (f"#{uid}" if uid else "гость")
            contact = email or (f"аккаунт #{uid}" if uid else "без контакта")
            notify_support(f"WIRING support от {who}", f"{who} · {contact}\n\n{body}")
            notice = "отправили. ответим на почту, если её указал, или найдём тебя по аккаунту"

    if request.is_json or request.headers.get("X-Requested-With") == "XMLHttpRequest" or "application/json" in request.headers.get("Accept", ""):
        if error:
            return jsonify({"ok": False, "error": error}), 400
        return jsonify({"ok": True, "notice": notice})

    return render_template(
        "legal.html",
        title="Поддержка",
        description="Написать в поддержку WIRING. Почту указывать не обязательно.",
        path="/support",
        site_url=SITE_URL,
        body=SUPPORT_HTML,
        support_form=True,
        me=me,
        notice=notice,
        error=error,
    )


@app.get("/robots.txt")
def robots():
    body = f"User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: {SITE_URL}/sitemap.xml\n"
    return app.response_class(body, mimetype="text/plain")


@app.get("/sitemap.xml")
def sitemap():
    urls = ["/", "/rules", "/privacy", "/support"]
    items = "".join(f"<url><loc>{SITE_URL}{path}</loc></url>" for path in urls)
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{items}</urlset>'
    return app.response_class(xml, mimetype="application/xml")


def _register_prefixed_routes() -> None:
    if not BASE_PATH:
        return
    mapping = []
    for rule in list(app.url_map.iter_rules()):
        if rule.endpoint == "static":
            continue
        if rule.rule.startswith(BASE_PATH):
            continue
        mapping.append((rule.rule, rule.endpoint, list(rule.methods or [])))
    for path, endpoint, methods in mapping:
        methods = [m for m in methods if m not in {"HEAD", "OPTIONS"}]
        app.add_url_rule(f"{BASE_PATH}{path}", f"{endpoint}__prefixed", app.view_functions[endpoint], methods=methods)


_register_prefixed_routes()


if __name__ == "__main__":
    app.run(host=HOST, port=PORT, debug=os.environ.get("FLASK_DEBUG") == "1")
