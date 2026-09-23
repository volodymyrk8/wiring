"""Normalize neuro/vibe tags stored on user profiles."""

from __future__ import annotations

import time

from catalog import LEGACY_VIBE_IDS, NEURO, NEURO_IDS, VIBE
from database import Connection

ACTIVE_VIBE_IDS = {item["id"] for item in VIBE}
ACTIVE_NEURO_IDS = {item["id"] for item in NEURO}

LEGACY_VIBE_CLEANUP_MIGRATION = "legacy_vibe_cleanup_2026_09"


def normalize_user_tags(neuro: list[str], vibe: list[str]) -> tuple[list[str], list[str]]:
    """Drop retired vibes; move neuro ids stored under vibe into neuro."""
    neuro_out: list[str] = []
    neuro_seen: set[str] = set()
    for tag in neuro:
        if tag in NEURO_IDS and tag not in neuro_seen:
            neuro_seen.add(tag)
            neuro_out.append(tag)

    vibe_out: list[str] = []
    vibe_seen: set[str] = set()
    for tag in vibe:
        if tag in LEGACY_VIBE_IDS:
            continue
        if tag in ACTIVE_VIBE_IDS:
            if tag not in vibe_seen:
                vibe_seen.add(tag)
                vibe_out.append(tag)
            continue
        if tag in NEURO_IDS and tag not in neuro_seen:
            neuro_seen.add(tag)
            neuro_out.append(tag)
    return neuro_out, vibe_out


def filter_hide_tags(items: list[str]) -> list[str]:
    allowed = NEURO_IDS | ACTIVE_VIBE_IDS
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        if item in LEGACY_VIBE_IDS:
            continue
        if item in allowed and item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _tags_for_user(conn: Connection, user_id: int) -> tuple[list[str], list[str]]:
    neuro: list[str] = []
    vibe: list[str] = []
    for row in conn.execute(
        "SELECT kind, tag FROM user_tags WHERE user_id = ? ORDER BY tag",
        (user_id,),
    ):
        if row["kind"] == "neuro":
            neuro.append(row["tag"])
        elif row["kind"] == "vibe":
            vibe.append(row["tag"])
    return neuro, vibe


def _replace_tags(conn: Connection, user_id: int, neuro: list[str], vibe: list[str]) -> None:
    conn.execute("DELETE FROM user_tags WHERE user_id = ?", (user_id,))
    for tag in neuro:
        conn.execute(
            "INSERT INTO user_tags (user_id, kind, tag) VALUES (?, 'neuro', ?)",
            (user_id, tag),
        )
    for tag in vibe:
        conn.execute(
            "INSERT INTO user_tags (user_id, kind, tag) VALUES (?, 'vibe', ?)",
            (user_id, tag),
        )


def ensure_legacy_vibe_cleanup(conn: Connection) -> int:
    """One-time DB cleanup; idempotent normalize on every boot until migration row exists."""
    from premium import ensure_app_migrations

    ensure_app_migrations(conn)
    if conn.execute(
        "SELECT 1 FROM app_migrations WHERE id = ?",
        (LEGACY_VIBE_CLEANUP_MIGRATION,),
    ).fetchone():
        return 0

    updated = 0
    for row in conn.execute("SELECT id, hide_tags FROM users"):
        uid = int(row["id"])
        raw_neuro, raw_vibe = _tags_for_user(conn, uid)
        neuro, vibe = normalize_user_tags(raw_neuro, raw_vibe)
        if neuro != raw_neuro or raw_vibe != vibe:
            _replace_tags(conn, uid, neuro, vibe)
            updated += 1

        raw_hide = str(row["hide_tags"] or "").strip()
        parsed_hide = [p.strip() for p in raw_hide.split(",") if p.strip()]
        cleaned_hide = filter_hide_tags(parsed_hide)
        if cleaned_hide != parsed_hide:
            conn.execute(
                "UPDATE users SET hide_tags = ? WHERE id = ?",
                (",".join(cleaned_hide), uid),
            )
            updated += 1

    conn.execute(
        "INSERT INTO app_migrations (id, applied_at) VALUES (?, ?)",
        (LEGACY_VIBE_CLEANUP_MIGRATION, int(time.time())),
    )
    return updated
