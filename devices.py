"""Device class from User-Agent and visit logging for admin stats."""

from __future__ import annotations

import hashlib
import time

from database import Connection
from typing import Any

DEVICE_LABELS: dict[str, str] = {
    "mobile": "телефон",
    "tablet": "планшет",
    "desktop": "компьютер",
    "unknown": "неизвестно",
}

OS_LABELS: dict[str, str] = {
    "ios": "iOS",
    "android": "Android",
    "windows": "Windows",
    "macos": "macOS",
    "linux": "Linux",
    "other": "другое",
}


def classify_user_agent(ua: str) -> tuple[str, str]:
    raw = (ua or "").strip()[:512]
    if not raw:
        return "unknown", "other"
    s = raw.lower()
    if "ipad" in s or "tablet" in s or ("android" in s and "mobile" not in s):
        device = "tablet"
    elif "mobile" in s or "iphone" in s or "ipod" in s or "android" in s:
        device = "mobile"
    else:
        device = "desktop"

    if "iphone" in s or "ipad" in s or "ipod" in s:
        os_name = "ios"
    elif "android" in s:
        os_name = "android"
    elif "windows" in s:
        os_name = "windows"
    elif "mac os" in s or "macintosh" in s:
        os_name = "macos"
    elif "linux" in s:
        os_name = "linux"
    else:
        os_name = "other"
    return device, os_name


def ensure_device_tables(conn: Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS device_visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            visitor_key TEXT NOT NULL DEFAULT '',
            device_class TEXT NOT NULL,
            os_name TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_device_visits_created ON device_visits(created_at)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_device_visits_class ON device_visits(device_class, created_at)"
    )


def visitor_key_from_request(ip: str, ua: str) -> str:
    base = f"{(ip or 'x').strip()}|{(ua or '')[:160]}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()[:24]


def track_device_visit(
    conn: Connection,
    *,
    user_id: int | None,
    ua: str,
    visitor_key: str = "",
    debounce_sec: int = 1800,
) -> bool:
    """Log a visit; debounce per user or anonymous visitor and device class."""
    device_class, os_name = classify_user_agent(ua)
    now = int(time.time())
    since = now - debounce_sec
    if user_id:
        recent = conn.execute(
            """
            SELECT 1 FROM device_visits
            WHERE user_id = ? AND device_class = ? AND created_at >= ?
            LIMIT 1
            """,
            (user_id, device_class, since),
        ).fetchone()
        key = ""
    else:
        key = (visitor_key or "").strip()
        if not key:
            return False
        recent = conn.execute(
            """
            SELECT 1 FROM device_visits
            WHERE user_id IS NULL AND visitor_key = ? AND device_class = ? AND created_at >= ?
            LIMIT 1
            """,
            (key, device_class, since),
        ).fetchone()
    if recent:
        return False
    conn.execute(
        """
        INSERT INTO device_visits (user_id, visitor_key, device_class, os_name, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user_id, key, device_class, os_name, now),
    )
    return True


def _top_rows(conn: Connection, *, kind: str, since: int, limit: int = 8) -> list[dict[str, Any]]:
    column = "device_class" if kind == "device" else "os_name"
    labels = DEVICE_LABELS if kind == "device" else OS_LABELS
    rows = conn.execute(
        f"""
        SELECT {column} AS value, COUNT(*) AS hits,
               COUNT(DISTINCT CASE
                 WHEN user_id IS NOT NULL THEN 'u' || user_id
                 ELSE 'v' || visitor_key
               END) AS visitors
        FROM device_visits
        WHERE created_at >= ?
        GROUP BY {column}
        ORDER BY hits DESC, value ASC
        LIMIT ?
        """,
        (since, limit),
    ).fetchall()
    return [
        {
            "value": str(row["value"]),
            "label": labels.get(str(row["value"]), str(row["value"])),
            "hits": int(row["hits"]),
            "visitors": int(row["visitors"]),
        }
        for row in rows
    ]


def device_usage_stats(conn: Connection) -> dict[str, Any]:
    ensure_device_tables(conn)
    now = int(time.time())
    day = 24 * 60 * 60
    since_7d = now - 7 * day
    since_30d = now - 30 * day
    visits_7d = conn.execute(
        "SELECT COUNT(*) AS n FROM device_visits WHERE created_at >= ?",
        (since_7d,),
    ).fetchone()["n"]
    visits_30d = conn.execute(
        "SELECT COUNT(*) AS n FROM device_visits WHERE created_at >= ?",
        (since_30d,),
    ).fetchone()["n"]
    return {
        "device_visits_7d": int(visits_7d or 0),
        "device_visits_30d": int(visits_30d or 0),
        "devices_30d": _top_rows(conn, kind="device", since=since_30d),
        "devices_7d": _top_rows(conn, kind="device", since=since_7d),
        "device_os_30d": _top_rows(conn, kind="os", since=since_30d, limit=10),
    }
