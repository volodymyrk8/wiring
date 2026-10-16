#!/usr/bin/env python3
"""Validate credentials without DB access, or run one bounded sync batch."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sendpulse_sync import Client, SendPulseError, load_config, sync_contacts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate", action="store_true", help="Read book metadata only; no contacts or DB access")
    args = parser.parse_args()
    try:
        config = load_config()
        if config is None:
            print("SendPulse disabled: credentials are not configured")
            return 1 if args.validate else 0
        client = Client(config)
        if args.validate:
            book = client.validate()
            print(json.dumps({"valid": True, "addressbook_id": config.addressbook_id,
                              "name": book.get("name"), "contacts": book.get("all_email_qty")}, ensure_ascii=False))
            return 0
        from database import connect
        conn = connect()
        try:
            stats = sync_contacts(conn, client)
        finally:
            conn.close()
        print(json.dumps(stats))
        return 1 if stats["failed"] else 0
    except SendPulseError as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
