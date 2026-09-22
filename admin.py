"""Operator stats for /admin."""

from __future__ import annotations

import hashlib
import time

from database import Connection
from typing import Any, Iterable

from catalog import INTENTS, NEURO, VIBE


def _is_guest(email: str) -> bool:
    return email.endswith("@wiring.guest") or email == "demo@wiring.app"


def _is_real(row) -> bool:
    return not row["is_seed"] and not _is_guest(str(row["email"]))


def _pair_key(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


_LABELS: dict[str, dict[str, str]] = {
    "neuro": {item["id"]: item["label"] for item in NEURO},
    "vibe": {item["id"]: item["label"] for item in VIBE},
    "intent": {item["id"]: item["label"] for item in INTENTS},
}


def _label(kind: str, value: str) -> str:
    if kind == "city":
        return value
    if kind == "age":
        return value
    if kind == "real":
        return "только живые"
    return _LABELS.get(kind, {}).get(value, value)


def ensure_filter_tables(conn: Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS filter_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            source TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            kind TEXT NOT NULL,
            value TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_filter_events_kind ON filter_events(kind, value, created_at)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_filter_events_user ON filter_events(user_id, fingerprint, created_at)"
    )


def track_filters(
    conn: Connection,
    *,
    user_id: int,
    source: str,
    neuro: Iterable[str] | None = None,
    vibe: Iterable[str] | None = None,
    intents: Iterable[str] | None = None,
    city: str = "",
    min_age: int = 18,
    max_age: int = 99,
    real_only: bool = False,
    debounce_sec: int = 1800,
) -> None:
    """Record an applied filter set. Same fingerprint from one user is debounced."""
    neuro_list = sorted({str(x) for x in (neuro or []) if x})
    vibe_list = sorted({str(x) for x in (vibe or []) if x})
    intent_list = sorted({str(x) for x in (intents or []) if x})
    city = (city or "").strip()
    age_active = not (min_age <= 18 and max_age >= 99)
    if not (neuro_list or vibe_list or intent_list or city or age_active or real_only):
        return

    parts = [
        source,
        "n:" + ",".join(neuro_list),
        "v:" + ",".join(vibe_list),
        "i:" + ",".join(intent_list),
        f"c:{city}",
        f"a:{min_age}-{max_age}" if age_active else "a:",
        "r:1" if real_only else "r:0",
    ]
    fingerprint = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:24]
    now = int(time.time())
    recent = conn.execute(
        """
        SELECT 1 FROM filter_events
        WHERE user_id = ? AND fingerprint = ? AND created_at >= ?
        LIMIT 1
        """,
        (user_id, fingerprint, now - debounce_sec),
    ).fetchone()
    if recent:
        return

    rows: list[tuple[int, str, str, str, str, int]] = []
    for value in neuro_list:
        rows.append((user_id, source, fingerprint, "neuro", value, now))
    for value in vibe_list:
        rows.append((user_id, source, fingerprint, "vibe", value, now))
    for value in intent_list:
        rows.append((user_id, source, fingerprint, "intent", value, now))
    if city:
        rows.append((user_id, source, fingerprint, "city", city[:64], now))
    if age_active:
        rows.append((user_id, source, fingerprint, "age", f"{min_age}–{max_age}", now))
    if real_only:
        rows.append((user_id, source, fingerprint, "real", "1", now))
    conn.executemany(
        """
        INSERT INTO filter_events (user_id, source, fingerprint, kind, value, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()


def _top_for_kind(conn: Connection, kind: str, since: int, limit: int = 12) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT value, COUNT(*) AS hits, COUNT(DISTINCT user_id) AS users
        FROM filter_events
        WHERE kind = ? AND created_at >= ?
        GROUP BY value
        ORDER BY hits DESC, users DESC, value ASC
        LIMIT ?
        """,
        (kind, since, limit),
    ).fetchall()
    return [
        {
            "value": row["value"],
            "label": _label(kind, str(row["value"])),
            "hits": int(row["hits"]),
            "users": int(row["users"]),
        }
        for row in rows
    ]


def filter_usage_stats(conn: Connection) -> dict[str, Any]:
    ensure_filter_tables(conn)
    now = int(time.time())
    day = 24 * 60 * 60
    since_all = 0
    since_30d = now - 30 * day
    since_7d = now - 7 * day

    sessions_7d = conn.execute(
        """
        SELECT COUNT(DISTINCT user_id || ':' || fingerprint) AS n
        FROM filter_events WHERE created_at >= ?
        """,
        (since_7d,),
    ).fetchone()["n"]
    sessions_30d = conn.execute(
        """
        SELECT COUNT(DISTINCT user_id || ':' || fingerprint) AS n
        FROM filter_events WHERE created_at >= ?
        """,
        (since_30d,),
    ).fetchone()["n"]
    users_30d = conn.execute(
        "SELECT COUNT(DISTINCT user_id) AS n FROM filter_events WHERE created_at >= ?",
        (since_30d,),
    ).fetchone()["n"]

    return {
        "filter_sessions_7d": int(sessions_7d or 0),
        "filter_sessions_30d": int(sessions_30d or 0),
        "filter_users_30d": int(users_30d or 0),
        "filters_neuro": _top_for_kind(conn, "neuro", since_all),
        "filters_vibe": _top_for_kind(conn, "vibe", since_all),
        "filters_intent": _top_for_kind(conn, "intent", since_all),
        "filters_city": _top_for_kind(conn, "city", since_all),
        "filters_age": _top_for_kind(conn, "age", since_all, limit=8),
        "filters_real": _top_for_kind(conn, "real", since_all, limit=3),
        "filters_neuro_7d": _top_for_kind(conn, "neuro", since_7d, limit=8),
        "filters_vibe_7d": _top_for_kind(conn, "vibe", since_7d, limit=8),
    }


def collect_stats(conn: Connection) -> dict[str, Any]:
    now = int(time.time())
    day = 24 * 60 * 60
    users = conn.execute("SELECT * FROM users").fetchall()
    real = [u for u in users if _is_real(u)]
    guests = [u for u in users if not u["is_seed"] and _is_guest(str(u["email"]))]
    seeds = [u for u in users if u["is_seed"]]
    real_ids = {u["id"] for u in real}
    seed_ids = {u["id"] for u in seeds}

    swipes = conn.execute("SELECT from_id, to_id, direction, created_at FROM swipes").fetchall()
    likes = [s for s in swipes if s["direction"] == "like"]
    passes = [s for s in swipes if s["direction"] == "pass"]
    today_swipes = [s for s in swipes if s["created_at"] >= now - day]
    yday_swipes = [s for s in swipes if now - 2 * day <= s["created_at"] < now - day]

    pairs: set[tuple[int, int]] = set()
    like_set = {(s["from_id"], s["to_id"]) for s in likes}
    for a, b in like_set:
        if (b, a) in like_set and a < b:
            pairs.add((a, b))
    real_real = sum(1 for a, b in pairs if a in real_ids and b in real_ids)
    real_seed = sum(1 for a, b in pairs if (a in real_ids and b in seed_ids) or (b in real_ids and a in seed_ids))
    matches_total = len(pairs)

    message_rows = conn.execute(
        "SELECT from_id, to_id, created_at FROM messages WHERE COALESCE(deleted_at, 0) = 0"
    ).fetchall()
    msg_pairs: set[tuple[int, int]] = set()
    for row in message_rows:
        msg_pairs.add(_pair_key(int(row["from_id"]), int(row["to_id"])))
    match_chats = sum(1 for pair in pairs if pair in msg_pairs)
    match_chats_real = sum(
        1 for pair in pairs if pair in msg_pairs and pair[0] in real_ids and pair[1] in real_ids
    )

    messages = conn.execute("SELECT from_id, to_id, created_at FROM messages").fetchall()
    reports = conn.execute("SELECT COUNT(*) AS n FROM reports").fetchone()["n"]
    blocks = conn.execute("SELECT COUNT(*) AS n FROM blocks").fetchone()["n"]

    swipes_by_user: dict[int, int] = {}
    for s in swipes:
        swipes_by_user[s["from_id"]] = swipes_by_user.get(s["from_id"], 0) + 1
    silent = [u for u in real if swipes_by_user.get(u["id"], 0) == 0]

    days: dict[str, dict[str, int]] = {}
    for u in users:
        if u["is_seed"]:
            continue
        key = time.strftime("%Y-%m-%d", time.localtime(int(u["created_at"] or 0)))
        bucket = days.setdefault(key, {"real": 0, "guest": 0})
        if _is_guest(str(u["email"])):
            bucket["guest"] += 1
        else:
            bucket["real"] += 1
    day_rows = [{"day": k, **v} for k, v in sorted(days.items(), reverse=True)[:14]]

    recent = []
    plus_n = 0
    for u in real:
        until = int(u["premium_until"] or 0) if "premium_until" in u.keys() else 0
        if until > now:
            plus_n += 1
    for u in sorted(real, key=lambda r: r["created_at"], reverse=True)[:30]:
        until = int(u["premium_until"] or 0) if "premium_until" in u.keys() else 0
        recent.append(
            {
                "id": u["id"],
                "name": u["name"],
                "age": u["age"],
                "city": u["city"],
                "email": u["email"],
                "created_at": u["created_at"],
                "swipes": swipes_by_user.get(u["id"], 0),
                "plus": until > now,
                "plus_until": time.strftime("%Y-%m-%d", time.localtime(until)) if until > now else "",
            }
        )

    payload = {
        "users_real": len(real),
        "users_guest": len(guests),
        "users_seed": len(seeds),
        "users_plus": plus_n,
        "swipes": len(swipes),
        "likes": len(likes),
        "passes": len(passes),
        "swipes_today": len(today_swipes),
        "swipes_yesterday": len(yday_swipes),
        "matches_total": matches_total,
        "matches_real": real_real,
        "matches_seed": real_seed,
        "match_chats": match_chats,
        "match_chats_real": match_chats_real,
        "messages": len(messages),
        "reports": reports,
        "blocks": blocks,
        "silent": [{"name": u["name"], "city": u["city"], "age": u["age"]} for u in silent],
        "days": day_rows,
        "recent": recent,
    }
    payload.update(filter_usage_stats(conn))
    return payload
