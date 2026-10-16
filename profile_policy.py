"""Shared profile edit policy for web and mobile clients."""
from __future__ import annotations

from datetime import datetime, timezone

NAME_CHANGE_SECONDS = 14 * 24 * 60 * 60


def name_change_available_at(user) -> int:
    changed = int(user["name_changed_at"] or 0) if "name_changed_at" in user.keys() else 0
    return changed + NAME_CHANGE_SECONDS if changed else 0


def name_change_error(user, name: str, now: int) -> tuple[str, int] | None:
    available = name_change_available_at(user)
    if name != user["name"] and available > now:
        date = datetime.fromtimestamp(available, timezone.utc).strftime("%d.%m.%Y %H:%M UTC")
        return f"Имя можно будет изменить {date}. Между сменами имени — 14 дней.", available
    return None
