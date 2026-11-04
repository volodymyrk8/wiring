#!/usr/bin/env python3
"""Deliver one bounded batch of consented registration events; never print IDs or secrets."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from registration_events import Client, load_config, sync
from database import connect


def main():
    config = load_config()
    if not config:
        print(json.dumps({'configured': False}))
        return 0
    conn = connect()
    try:
        print(json.dumps(sync(conn, Client(config))))
    finally:
        conn.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
