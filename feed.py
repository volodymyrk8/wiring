"""Per-user discovery delivery history, independent of likes and chat lifecycle."""
from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

from database import Connection, Row


def ensure_feed_history(conn: Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS feed_history (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            other_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            delivered_at BIGINT NOT NULL,
            viewed_at BIGINT,
            excluded_at BIGINT,
            PRIMARY KEY (user_id, other_id)
        );
        CREATE INDEX IF NOT EXISTS idx_feed_history_other ON feed_history(other_id);
    """)
    # Existing explicit passes remain permanent even if an older client tries rewind.
    conn.execute("""
        INSERT INTO feed_history (user_id, other_id, delivered_at, excluded_at)
        SELECT from_id, to_id, created_at, created_at FROM swipes WHERE direction = 'pass'
        ON CONFLICT (user_id, other_id) DO UPDATE
        SET excluded_at = COALESCE(feed_history.excluded_at, excluded.excluded_at)
    """)


def claim_feed(
    conn: Connection, user_id: int, *, min_age: int, max_age: int, city: str,
    limit: int, eligible: Callable[[Row], dict[str, Any] | None],
) -> tuple[list[dict[str, Any]], bool]:
    """Reserve a random page atomically; the caller must commit before sending it.

    Lock the viewer, not candidates: different viewers discover independently.
    At READ COMMITTED the SELECT after the lock sees the previous request's claims.
    Delivery is reserved before response, so retries/tabs cannot deliver duplicates.
    """
    conn.execute("SELECT id FROM users WHERE id = ? FOR UPDATE", (user_id,)).fetchone()
    rows = conn.execute("""
        SELECT * FROM users
        WHERE id != ? AND COALESCE(deleted_at, 0) = 0
          AND age BETWEEN ? AND ? AND (? = '' OR city = ?)
          AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.from_id = ? AND s.to_id = users.id)
          AND NOT EXISTS (SELECT 1 FROM feed_history h WHERE h.user_id = ? AND h.other_id = users.id)
          AND (EXISTS (SELECT 1 FROM photos p WHERE p.user_id = users.id) OR COALESCE(photo, '') != '')
        ORDER BY random()
    """, (user_id, min_age, max_age, city, city, user_id, user_id)).fetchall()
    cards = []
    has_more = False
    now = int(time.time())
    for row in rows:
        card = eligible(row)
        if card is None:
            continue
        if len(cards) == limit:
            has_more = True
            break
        inserted = conn.execute("""
            INSERT INTO feed_history (user_id, other_id, delivered_at)
            VALUES (?, ?, ?) ON CONFLICT (user_id, other_id) DO NOTHING
        """, (user_id, row["id"], now)).rowcount
        if inserted:
            cards.append(card)
    return cards, has_more


def mark_viewed(conn: Connection, user_id: int, other_id: int) -> bool:
    return bool(conn.execute("""
        UPDATE feed_history SET viewed_at = COALESCE(viewed_at, ?)
        WHERE user_id = ? AND other_id = ?
    """, (int(time.time()), user_id, other_id)).rowcount)


def exclude_profile(conn: Connection, user_id: int, other_id: int) -> None:
    now = int(time.time())
    conn.execute("""
        INSERT INTO feed_history (user_id, other_id, delivered_at, excluded_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id, other_id) DO UPDATE
        SET excluded_at = COALESCE(feed_history.excluded_at, excluded.excluded_at)
    """, (user_id, other_id, now, now))
