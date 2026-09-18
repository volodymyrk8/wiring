#!/usr/bin/env python3
"""Create or refresh the local dev login (see README). Safe to run repeatedly."""

from __future__ import annotations

import os
import sys
import time

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPTS_DIR)
for path in (ROOT, SCRIPTS_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)

from werkzeug.security import generate_password_hash

# Credentials and usage: README.md «Тестирование сайта: вход». Local only.
DEV_USER_EMAIL = "dev@wiring.test"
DEV_USER_PASSWORD = "wiring-dev"
DEV_USER_NAME = "Дев"

PEER_USER_EMAIL = "peer@wiring.test"
PEER_USER_NAME = "Пир"
PEER_GREETING = "привет, это тестовый чат"


def main() -> None:
    from app import _attach_portrait, app, init_db, replace_tags, db

    init_db()
    with app.app_context():
        conn = db()
        dev_id = _ensure_dev(conn)
        _ensure_peer(conn, dev_id)
        from seed_test_social import seed_test_social

        seed_test_social(conn, dev_id)
        conn.commit()


def _ensure_dev(conn) -> int:
    from app import _attach_portrait, replace_tags

    now = int(time.time())
    row = conn.execute("SELECT id FROM users WHERE email = ?", (DEV_USER_EMAIL,)).fetchone()
    pw_hash = generate_password_hash(DEV_USER_PASSWORD, method="pbkdf2:sha256")
    if row:
        uid = int(row["id"])
        conn.execute(
            """
            UPDATE users SET
                password_hash = ?, name = ?, age = 27, city = ?, gender = 'other',
                looking_for = 'everyone', bio = ?, photo = ?, intent = 'dating',
                special_data_consent_at = ?, photo_rights_consent_at = ?,
                privacy_accepted_at = COALESCE(privacy_accepted_at, ?),
                email_verified_at = COALESCE(email_verified_at, ?),
                onboard_done = 1, is_seed = 0, last_seen = ?
            WHERE id = ?
            """,
            (
                pw_hash,
                DEV_USER_NAME,
                "Нови-Сад",
                "Локальный тестовый аккаунт. Только для dev на 127.0.0.1:5070.",
                "portraits/p01.jpg",
                now,
                now,
                now,
                now,
                now,
                uid,
            ),
        )
    else:
        cur = conn.execute(
            """
            INSERT INTO users (
                email, password_hash, name, age, city, gender, looking_for, bio, photo,
                job, intent, height, communication, privacy_accepted_at,
                special_data_consent_at, photo_rights_consent_at, marketing_consent_at,
                email_verified_at, onboard_done, is_seed, created_at, last_seen
            )
            VALUES (?, ?, ?, 27, ?, 'other', 'everyone', ?, ?, '', 'dating', NULL, '', ?, ?, ?, NULL, ?, 1, 0, ?, ?)
            """,
            (
                DEV_USER_EMAIL,
                pw_hash,
                DEV_USER_NAME,
                "Нови-Сад",
                "Локальный тестовый аккаунт. Только для dev на 127.0.0.1:5070.",
                "portraits/p01.jpg",
                now,
                now,
                now,
                now,
                now,
                now,
            ),
        )
        uid = int(cur.lastrowid)
    replace_tags(conn, uid, ["audhd"], ["nonsmalltalk"])
    _attach_portrait(conn, uid, "portraits/p01.jpg")
    print(f"dev user ready: {DEV_USER_EMAIL} / {DEV_USER_PASSWORD}")
    return uid


def _ensure_peer(conn, dev_id: int) -> None:
    from app import _attach_portrait, replace_tags

    now = int(time.time())
    pw_hash = generate_password_hash(DEV_USER_PASSWORD, method="pbkdf2:sha256")
    row = conn.execute("SELECT id FROM users WHERE email = ?", (PEER_USER_EMAIL,)).fetchone()
    if row:
        peer_id = int(row["id"])
        conn.execute(
            """
            UPDATE users SET
                password_hash = ?, name = ?, age = 26, city = ?, gender = 'woman',
                looking_for = 'everyone', bio = ?, photo = ?, intent = 'dating',
                special_data_consent_at = ?, photo_rights_consent_at = ?,
                privacy_accepted_at = COALESCE(privacy_accepted_at, ?),
                email_verified_at = COALESCE(email_verified_at, ?),
                onboard_done = 1, is_seed = 0
            WHERE id = ?
            """,
            (
                pw_hash,
                PEER_USER_NAME,
                "Нови-Сад",
                "Второй локальный аккаунт для проверки чатов и мэтчей.",
                "portraits/p02.jpg",
                now,
                now,
                now,
                now,
                peer_id,
            ),
        )
    else:
        cur = conn.execute(
            """
            INSERT INTO users (
                email, password_hash, name, age, city, gender, looking_for, bio, photo,
                job, intent, height, communication, privacy_accepted_at,
                special_data_consent_at, photo_rights_consent_at, marketing_consent_at,
                email_verified_at, onboard_done, is_seed, created_at, last_seen
            )
            VALUES (?, ?, ?, 26, ?, 'woman', 'everyone', ?, ?, '', 'dating', NULL, '', ?, ?, ?, NULL, ?, 1, 0, ?, ?)
            """,
            (
                PEER_USER_EMAIL,
                pw_hash,
                PEER_USER_NAME,
                "Нови-Сад",
                "Второй локальный аккаунт для проверки чатов и мэтчей.",
                "portraits/p02.jpg",
                now,
                now,
                now,
                now,
                now,
                now,
            ),
        )
        peer_id = int(cur.lastrowid)
    replace_tags(conn, peer_id, ["adhd"], ["nonsmalltalk"])
    _attach_portrait(conn, peer_id, "portraits/p02.jpg")
    for a, b in ((dev_id, peer_id), (peer_id, dev_id)):
        conn.execute(
            """
            INSERT INTO swipes (from_id, to_id, direction, created_at)
            VALUES (?, ?, 'like', ?)
            ON CONFLICT(from_id, to_id) DO UPDATE SET direction = excluded.direction
            """,
            (a, b, now),
        )
    has_msg = conn.execute(
        "SELECT 1 FROM messages WHERE from_id = ? AND to_id = ? LIMIT 1",
        (peer_id, dev_id),
    ).fetchone()
    if not has_msg:
        conn.execute(
            "INSERT INTO messages (from_id, to_id, body, created_at) VALUES (?, ?, ?, ?)",
            (peer_id, dev_id, PEER_GREETING, now),
        )
    print(f"peer user ready: {PEER_USER_EMAIL} / {DEV_USER_PASSWORD} (match with dev)")


if __name__ == "__main__":
    main()
