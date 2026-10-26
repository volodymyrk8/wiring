"""Shared profile edit policy for web and mobile clients."""
from __future__ import annotations

from i18n import tr

from datetime import datetime, timezone

NAME_CHANGE_SECONDS = 14 * 24 * 60 * 60


def name_change_available_at(user) -> int:
    changed = int(user["name_changed_at"] or 0) if "name_changed_at" in user.keys() else 0
    return changed + NAME_CHANGE_SECONDS if changed else 0


def name_change_error(user, name: str, now: int) -> tuple[str, int] | None:
    if ("profile_setup_required" in user.keys() and user["profile_setup_required"]) or str(user["name"] or "").strip().casefold() in {"", "участник", "participant"}:
        return None
    available = name_change_available_at(user)
    if name != user["name"] and available > now:
        date = datetime.fromtimestamp(available, timezone.utc).strftime("%d.%m.%Y %H:%M UTC")
        return tr("Имя можно будет изменить {0}. Между сменами имени — 14 дней." ,date), available
    return None
