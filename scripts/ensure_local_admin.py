#!/usr/bin/env python3
"""Provision an opt-in local admin login without printing its password."""

from __future__ import annotations

import secrets
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
LOGIN = "LEX"


def main() -> None:
    lines = ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.exists() else []
    values = {}
    for line in lines:
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    changed = False
    if not values.get("LOCAL_ADMIN_LOGIN"):
        lines.append(f"LOCAL_ADMIN_LOGIN={LOGIN}")
        changed = True
    if not values.get("LOCAL_ADMIN_PASSWORD"):
        lines.append(f"LOCAL_ADMIN_PASSWORD={secrets.token_urlsafe(24)}")
        changed = True
    if not values.get("ADMIN_TOKEN"):
        lines.append(f"ADMIN_TOKEN={secrets.token_urlsafe(24)}")
        changed = True
    if changed or not ENV_FILE.exists():
        ENV_FILE.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
        ENV_FILE.chmod(0o600)
    print("local admin ready: login LEX; password is stored in .env and was not printed")


if __name__ == "__main__":
    main()
