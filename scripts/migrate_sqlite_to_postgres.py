#!/usr/bin/env python3
"""Copy data from production SQLite file into PostgreSQL (DATABASE_URL must be set).

Usage on server (after creating DB/user):
  export DATABASE_URL='postgresql://wiring_app:SECRET@127.0.0.1:5432/wiring'
  export DATING_DB=/var/lib/wiring/wiring.sqlite3
  python3 scripts/migrate_sqlite_to_postgres.py

Runs init_db() on Postgres first (empty schema), then copies rows table-by-table.
Existing Postgres data in listed tables is truncated before copy.
"""

from __future__ import annotations

import os
import sqlite3
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

TABLES = [
    "users",
    "user_tags",
    "user_prompts",
    "albums",
    "photos",
    "swipes",
    "messages",
    "blocks",
    "reports",
    "reads",
    "notifications",
    "notes",
    "snoozes",
    "promo_codes",
    "promo_redemptions",
    "referrals",
    "support_tickets",
    "password_resets",
    "email_verifications",
    "filter_events",
    "feature_tasks",
    "telegram_cursors",
    "chat_openers",
]


def main() -> None:
    db_path = os.environ.get("DATING_DB", os.path.join(BASE, "data", "wiring.sqlite3"))
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url.startswith("postgres"):
        print("Set DATABASE_URL to a postgresql://… connection string.", file=sys.stderr)
        sys.exit(1)
    if not os.path.isfile(db_path):
        print(f"SQLite file not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    os.environ["DATABASE_URL"] = url
    from app import init_db  # noqa: WPS433
    from database import USE_PG, connect

    if not USE_PG:
        print("DATABASE_URL not active after import.", file=sys.stderr)
        sys.exit(1)

    print("Initializing PostgreSQL schema…")
    init_db()

    src = sqlite3.connect(db_path)
    src.row_factory = sqlite3.Row
    dst = connect(db_path)

    try:
        dst.execute(
            "TRUNCATE users, user_tags, user_prompts, albums, photos, swipes, messages, "
            "blocks, reports, reads, notifications, notes, snoozes, promo_codes, "
            "promo_redemptions, referrals, support_tickets, password_resets, "
            "email_verifications, filter_events, feature_tasks, telegram_cursors, "
            "chat_openers RESTART IDENTITY CASCADE"
        )
        dst.commit()
        for table in TABLES:
            cols = [r[1] for r in src.execute(f"PRAGMA table_info({table})")]
            if not cols:
                print(f"  skip {table} (missing in sqlite)")
                continue
            rows = src.execute(f"SELECT * FROM {table}").fetchall()
            if not rows:
                print(f"  {table}: 0 rows")
                continue
            placeholders = ", ".join(["?"] * len(cols))
            col_list = ", ".join(f'"{c}"' if c == "read" else c for c in cols)
            sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})"
            batch = [tuple(row[c] for c in cols) for row in rows]
            dst.executemany(sql, batch)
            dst.commit()
            print(f"  {table}: {len(batch)} rows")

        # Reset sequences to max(id)+1 for serial tables.
        for table in (
            "users",
            "albums",
            "photos",
            "messages",
            "reports",
            "notifications",
            "support_tickets",
            "filter_events",
            "feature_tasks",
        ):
            dst.execute(
                f"""
                SELECT setval(
                    pg_get_serial_sequence('{table}', 'id'),
                    COALESCE((SELECT MAX(id) FROM {table}), 1),
                    (SELECT COUNT(*) > 0 FROM {table})
                )
                """
            )
        dst.commit()
        print("Done.")
    finally:
        src.close()
        dst.close()


if __name__ == "__main__":
    main()
