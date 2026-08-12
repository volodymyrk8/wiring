#!/usr/bin/env python3
"""WIRING — niche swipe app for neurodivergent dating (MVP)."""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
import time
from functools import wraps
from typing import Any

from flask import Flask, g, jsonify, redirect, render_template, request, send_from_directory, session
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

from catalog import (
    GENDER_IDS,
    LOOKING_IDS,
    NEURO_IDS,
    VIBE_IDS,
    catalog_payload,
)
from seed import SEED_USERS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
BASE_PATH = os.environ.get("BASE_PATH", "").rstrip("/")
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "5070"))
DB_PATH = os.environ.get("DATING_DB", os.path.join(BASE_DIR, "data", "wiring.sqlite3"))
APP_SECRET_KEY = os.environ.get("APP_SECRET_KEY") or secrets.token_hex(32)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

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
)

_rate: dict[str, list[float]] = {}


def prefix(path: str) -> str:
    if not path.startswith("/"):
        path = "/" + path
    return f"{BASE_PATH}{path}" if BASE_PATH else path


def db() -> sqlite3.Connection:
    conn = getattr(g, "_db", None)
    if conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        g._db = conn
    return conn


@app.teardown_appcontext
def _close_db(_exc: BaseException | None) -> None:
    conn = getattr(g, "_db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
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
            is_seed INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_tags (
            user_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            tag TEXT NOT NULL,
            PRIMARY KEY (user_id, kind, tag),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
        """
    )
    existing = {row["email"] for row in conn.execute("SELECT email FROM users")}
    now = int(time.time())
    for person in SEED_USERS:
        if person["email"] in existing:
            continue
        password = person.get("password") or secrets.token_urlsafe(18)
        cur = conn.execute(
            """
            INSERT INTO users (email, password_hash, name, age, city, gender, looking_for, bio, photo, is_seed, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                person["email"],
                generate_password_hash(password, method="pbkdf2:sha256"),
                person["name"],
                person["age"],
                person["city"],
                person["gender"],
                person["looking_for"],
                person["bio"],
                person.get("photo") or "",
                0 if person.get("is_demo") else 1,
                now,
            ),
        )
        uid = cur.lastrowid
        for tag in person.get("neuro") or []:
            conn.execute("INSERT INTO user_tags (user_id, kind, tag) VALUES (?, 'neuro', ?)", (uid, tag))
        for tag in person.get("vibe") or []:
            conn.execute("INSERT INTO user_tags (user_id, kind, tag) VALUES (?, 'vibe', ?)", (uid, tag))
    conn.commit()
    conn.close()


os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
init_db()


def too_many(key: str, limit: int, window: float) -> bool:
    now = time.time()
    bucket = [ts for ts in _rate.get(key, []) if now - ts < window]
    if len(bucket) >= limit:
        _rate[key] = bucket
        return True
    bucket.append(now)
    _rate[key] = bucket
    return False


def current_user() -> dict[str, Any] | None:
    uid = session.get("uid")
    if not uid:
        return None
    row = db().execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return user_public(row, include_email=True) if row else None


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("uid"):
            return jsonify({"ok": False, "error": "нужна сессия"}), 401
        return fn(*args, **kwargs)

    return wrapper


def tags_for(user_id: int) -> dict[str, list[str]]:
    neuro: list[str] = []
    vibe: list[str] = []
    for row in db().execute("SELECT kind, tag FROM user_tags WHERE user_id = ? ORDER BY tag", (user_id,)):
        if row["kind"] == "neuro":
            neuro.append(row["tag"])
        elif row["kind"] == "vibe":
            vibe.append(row["tag"])
    return {"neuro": neuro, "vibe": vibe}


def user_public(row: sqlite3.Row, include_email: bool = False) -> dict[str, Any]:
    tags = tags_for(row["id"])
    payload = {
        "id": row["id"],
        "name": row["name"],
        "age": row["age"],
        "city": row["city"],
        "gender": row["gender"],
        "looking_for": row["looking_for"],
        "bio": row["bio"],
        "photo": row["photo"] or "",
        "neuro": tags["neuro"],
        "vibe": tags["vibe"],
    }
    if include_email:
        payload["email"] = row["email"]
    return payload


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
    if len(cleaned) > 8:
        return None, "слишком много тегов — оставь до 8"
    return cleaned, None


def parse_profile(data: dict[str, Any], *, require_password: bool) -> tuple[dict[str, Any] | None, str | None]:
    name = str(data.get("name") or "").strip()
    city = str(data.get("city") or "").strip()
    bio = str(data.get("bio") or "").strip()
    gender = str(data.get("gender") or "").strip()
    looking_for = str(data.get("looking_for") or "").strip()
    try:
        age = int(data.get("age"))
    except (TypeError, ValueError):
        return None, "возраст — число"
    if not (2 <= len(name) <= 32):
        return None, "имя: 2–32 символа"
    if not (18 <= age <= 99):
        return None, "только 18+"
    if not (2 <= len(city) <= 40):
        return None, "город: 2–40 символов"
    if len(bio) > 280:
        return None, "био до 280 символов"
    if gender not in GENDER_IDS:
        return None, "выбери гендер"
    if looking_for not in LOOKING_IDS:
        return None, "кого ищешь?"
    neuro, err = parse_tags(data.get("neuro"), NEURO_IDS, required=True)
    if err:
        return None, err
    vibe, err = parse_tags(data.get("vibe"), VIBE_IDS, required=False)
    if err:
        return None, err
    payload: dict[str, Any] = {
        "name": name,
        "age": age,
        "city": city,
        "gender": gender,
        "looking_for": looking_for,
        "bio": bio,
        "neuro": neuro,
        "vibe": vibe or [],
    }
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


def replace_tags(conn: sqlite3.Connection, user_id: int, neuro: list[str], vibe: list[str]) -> None:
    conn.execute("DELETE FROM user_tags WHERE user_id = ?", (user_id,))
    for tag in neuro:
        conn.execute("INSERT INTO user_tags (user_id, kind, tag) VALUES (?, 'neuro', ?)", (user_id, tag))
    for tag in vibe:
        conn.execute("INSERT INTO user_tags (user_id, kind, tag) VALUES (?, 'vibe', ?)", (user_id, tag))


def looking_matches(viewer_looking: str, candidate_gender: str) -> bool:
    if viewer_looking in {"everyone", "friends"}:
        return True
    if viewer_looking == "women":
        return candidate_gender == "woman"
    if viewer_looking == "men":
        return candidate_gender == "man"
    return True


@app.get("/")
def index():
    if BASE_PATH and request.path.rstrip("/") == "":
        return redirect(prefix("/"))
    return render_template("index.html", base_path=BASE_PATH)


@app.get("/health")
def health():
    count = db().execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
    return jsonify({"ok": True, "users": count})


@app.get("/api/catalog")
def api_catalog():
    return jsonify({"ok": True, **catalog_payload()})


@app.get("/api/me")
def api_me():
    user = current_user()
    return jsonify({"ok": True, "user": user})


@app.post("/api/register")
def api_register():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "x").split(",")[0].strip()
    if too_many(f"reg:{ip}", 8, 3600):
        return jsonify({"ok": False, "error": "слишком много регистраций, подожди"}), 429
    data = request.get_json(silent=True) or {}
    parsed, err = parse_profile(data, require_password=True)
    if err or parsed is None:
        return jsonify({"ok": False, "error": err}), 400
    conn = db()
    if conn.execute("SELECT id FROM users WHERE email = ?", (parsed["email"],)).fetchone():
        return jsonify({"ok": False, "error": "такая почта уже есть"}), 409
    cur = conn.execute(
        """
        INSERT INTO users (email, password_hash, name, age, city, gender, looking_for, bio, photo, is_seed, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?)
        """,
        (
            parsed["email"],
            generate_password_hash(parsed["password"], method="pbkdf2:sha256"),
            parsed["name"],
            parsed["age"],
            parsed["city"],
            parsed["gender"],
            parsed["looking_for"],
            parsed["bio"],
            int(time.time()),
        ),
    )
    uid = int(cur.lastrowid)
    replace_tags(conn, uid, parsed["neuro"], parsed["vibe"])
    conn.commit()
    session.clear()
    session.permanent = True
    session["uid"] = uid
    user = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return jsonify({"ok": True, "user": user_public(user, include_email=True)})


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
    session.clear()
    session.permanent = True
    session["uid"] = row["id"]
    return jsonify({"ok": True, "user": user_public(row, include_email=True)})


@app.post("/api/demo")
def api_demo():
    row = db().execute("SELECT * FROM users WHERE email = ?", ("demo@wiring.app",)).fetchone()
    if not row:
        return jsonify({"ok": False, "error": "демо-профиль не создан"}), 500
    session.clear()
    session.permanent = True
    session["uid"] = row["id"]
    return jsonify({"ok": True, "user": user_public(row, include_email=True)})


@app.post("/api/logout")
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.patch("/api/me")
@login_required
def api_patch_me():
    data = request.get_json(silent=True) or {}
    parsed, err = parse_profile({**data, "email": "x@y.zz", "password": "ignore1"}, require_password=False)
    if err or parsed is None:
        return jsonify({"ok": False, "error": err}), 400
    uid = session["uid"]
    conn = db()
    conn.execute(
        """
        UPDATE users SET name = ?, age = ?, city = ?, gender = ?, looking_for = ?, bio = ?
        WHERE id = ?
        """,
        (parsed["name"], parsed["age"], parsed["city"], parsed["gender"], parsed["looking_for"], parsed["bio"], uid),
    )
    replace_tags(conn, uid, parsed["neuro"], parsed["vibe"])
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return jsonify({"ok": True, "user": user_public(row, include_email=True)})


@app.get("/api/feed")
@login_required
def api_feed():
    me = db().execute("SELECT * FROM users WHERE id = ?", (session["uid"],)).fetchone()
    if not me:
        return jsonify({"ok": False, "error": "нет профиля"}), 401
    neuro_filter = [t for t in request.args.get("neuro", "").split(",") if t in NEURO_IDS]
    vibe_filter = [t for t in request.args.get("vibe", "").split(",") if t in VIBE_IDS]
    rows = db().execute(
        """
        SELECT * FROM users
        WHERE id != ?
          AND id NOT IN (SELECT to_id FROM swipes WHERE from_id = ?)
        ORDER BY is_seed DESC, id ASC
        """,
        (me["id"], me["id"]),
    ).fetchall()
    cards = []
    for row in rows:
        if row["email"] == "demo@wiring.app":
            continue
        if not looking_matches(me["looking_for"], row["gender"]):
            continue
        card = user_public(row)
        if neuro_filter and not set(neuro_filter) & set(card["neuro"]):
            continue
        if vibe_filter and not set(vibe_filter) & set(card["vibe"]):
            continue
        cards.append(card)
        if len(cards) >= 30:
            break
    return jsonify({"ok": True, "cards": cards})


@app.post("/api/swipe")
@login_required
def api_swipe():
    data = request.get_json(silent=True) or {}
    try:
        target_id = int(data.get("target_id"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "нет цели"}), 400
    direction = str(data.get("direction") or "")
    if direction not in {"like", "pass"}:
        return jsonify({"ok": False, "error": "like или pass"}), 400
    uid = session["uid"]
    if target_id == uid:
        return jsonify({"ok": False, "error": "это ты"}), 400
    conn = db()
    target = conn.execute("SELECT * FROM users WHERE id = ?", (target_id,)).fetchone()
    if not target:
        return jsonify({"ok": False, "error": "человек не найден"}), 404
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
        elif target["is_seed"]:
            # Seed profiles like back so the demo loop closes.
            conn.execute(
                """
                INSERT INTO swipes (from_id, to_id, direction, created_at)
                VALUES (?, ?, 'like', ?)
                ON CONFLICT(from_id, to_id) DO UPDATE SET direction = 'like'
                """,
                (target_id, uid, int(time.time())),
            )
            conn.commit()
            matched = True
    return jsonify(
        {
            "ok": True,
            "matched": matched,
            "match": user_public(target) if matched else None,
        }
    )


@app.get("/api/matches")
@login_required
def api_matches():
    uid = session["uid"]
    rows = db().execute(
        """
        SELECT u.* FROM users u
        JOIN swipes a ON a.to_id = u.id AND a.from_id = ? AND a.direction = 'like'
        JOIN swipes b ON b.from_id = u.id AND b.to_id = ? AND b.direction = 'like'
        ORDER BY a.created_at DESC
        """,
        (uid, uid),
    ).fetchall()
    return jsonify({"ok": True, "matches": [user_public(row) for row in rows]})


@app.get("/public/<path:filename>")
def public_files(filename: str):
    return send_from_directory(PUBLIC_DIR, filename)


def _register_prefixed_routes() -> None:
    if not BASE_PATH:
        return
    # Expose the same handlers under /dating/... when mounted behind nginx.
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
