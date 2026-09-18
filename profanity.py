"""Lightweight Russian profanity / abuse filter for public profile text."""

from __future__ import annotations

import re

_BAD = (
    r"ху[йияюеё]\w*",
    r"пизд\w*",
    r"пезд\w*",
    r"еба[нтл]\w*",
    r"ёба[нтл]\w*",
    r"ебл\w*",
    r"ёбл\w*",
    r"бляд\w*",
    r"блять",
    r"сука",
    r"суки",
    r"сучку",
    r"сучке",
    r"мудак\w*",
    r"мудил\w*",
    r"говн\w*",
    r"дерьм\w*",
    r"залуп\w*",
    r"пидор\w*",
    r"пидар\w*",
    r"педик\w*",
    r"гандон\w*",
    r"гондон\w*",
    r"дроч\w*",
    r"fuck\w*",
    r"shit\w*",
    r"bitch\w*",
    r"cunt\w*",
    r"asshole\w*",
)

_PATTERN = re.compile(
    r"(?<![а-яёa-z0-9_])(" + "|".join(_BAD) + r")(?![а-яёa-z0-9_])",
    re.IGNORECASE | re.UNICODE,
)


def has_profanity(text: str) -> bool:
    return bool(_PATTERN.search(str(text or "")))


def profanity_hit(text: str) -> str | None:
    m = _PATTERN.search(str(text or ""))
    return m.group(0) if m else None
