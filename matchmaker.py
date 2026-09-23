"""Decide whether a seed profile likes someone back."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from cities import normalize_city


def _looking_ok(looking: str, gender: str) -> bool:
    if looking in {"everyone", "friends"}:
        return True
    if gender in {"hidden", "other"}:
        return True
    if looking == "women":
        return gender == "woman"
    if looking == "men":
        return gender == "man"
    return True


def _mutual_looking_ok(a_looking: str, a_gender: str, b_looking: str, b_gender: str) -> bool:
    return _looking_ok(a_looking, b_gender) and _looking_ok(b_looking, a_gender)


def pack_profile(row: Any, tags: dict[str, list[str]], prompts: list[dict[str, str]]) -> dict[str, Any]:
    keys = set(row.keys()) if hasattr(row, "keys") else set()

    def get(name: str, default: Any = "") -> Any:
        if hasattr(row, "keys") and name in keys:
            return row[name]
        if isinstance(row, dict):
            return row.get(name, default)
        return default

    return {
        "id": int(get("id") or 0),
        "name": str(get("name") or ""),
        "age": int(get("age") or 0),
        "city": str(get("city") or ""),
        "gender": str(get("gender") or ""),
        "looking_for": str(get("looking_for") or "everyone"),
        "intent": str(get("intent") or "dating"),
        "job": str(get("job") or ""),
        "bio": str(get("bio") or "")[:400],
        "communication": str(get("communication") or "")[:220],
        "neuro": list(tags.get("neuro") or []),
        "vibe": list(tags.get("vibe") or []),
        "prompts": [{"id": p.get("id"), "answer": str(p.get("answer") or "")[:160]} for p in (prompts or [])],
    }


def heuristic_like(seed: dict[str, Any], candidate: dict[str, Any]) -> bool:
    if not _mutual_looking_ok(
        str(seed.get("looking_for") or "everyone"),
        str(seed.get("gender") or ""),
        str(candidate.get("looking_for") or "everyone"),
        str(candidate.get("gender") or ""),
    ):
        return False
    score = 0
    seed_neuro = set(seed.get("neuro") or [])
    cand_neuro = set(candidate.get("neuro") or [])
    seed_vibe = set(seed.get("vibe") or [])
    cand_vibe = set(candidate.get("vibe") or [])
    score += min(4, 2 * len(seed_neuro & cand_neuro))
    score += min(3, len(seed_vibe & cand_vibe))
    try:
        age_gap = abs(int(seed.get("age") or 0) - int(candidate.get("age") or 0))
    except (TypeError, ValueError):
        age_gap = 99
    if age_gap <= 6:
        score += 1
    elif age_gap > 12:
        score -= 1
    if normalize_city(str(seed.get("city") or "")).lower() == normalize_city(str(candidate.get("city") or "")).lower():
        score += 2
    intent_s = str(seed.get("intent") or "dating")
    intent_c = str(candidate.get("intent") or "dating")
    if intent_s == intent_c and intent_s in {"relationship", "friends"}:
        score += 1
    if {intent_s, intent_c} == {"relationship", "friends"}:
        score -= 1
    if seed.get("communication") and candidate.get("communication"):
        score += 1
    lucky = hash(f"{seed.get('id')}:{candidate.get('id')}") % 100
    if lucky < 18:
        score += 1
    if lucky > 88:
        score -= 1
    return score >= 3


def _openai_like(seed: dict[str, Any], candidate: dict[str, Any]) -> bool | None:
    if os.environ.get("WIRING_SEED_AI", "1").lower() in {"0", "off", "false", "no"}:
        return None
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        return None
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    payload = {
        "model": model,
        "temperature": 0.55,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "Ты — человек с этой анкетой на сайте знакомств WIRING. "
                    "Реши, лайкнешь ли ты кандидата в ответ. Будь разборчивым: "
                    "примерно 35–45% да, не всем. Смотри на нейротип, вайб, "
                    "намерение, возраст, город, как писать. "
                    "Если их пол тебе не подходит — всегда нет. "
                    "Ответь только JSON {\"like\": true} или {\"like\": false}."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {"я": {k: v for k, v in seed.items() if k != "id"}, "кандидат": {k: v for k, v in candidate.items() if k != "id"}},
                    ensure_ascii=False,
                ),
            },
        ],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=4.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["choices"][0]["message"]["content"]
        parsed = json.loads(text)
        return bool(parsed.get("like"))
    except (urllib.error.URLError, TimeoutError, KeyError, IndexError, TypeError, json.JSONDecodeError, OSError):
        return None


def seed_decides_like(seed: dict[str, Any], candidate: dict[str, Any]) -> bool:
    if not _mutual_looking_ok(
        str(seed.get("looking_for") or "everyone"),
        str(seed.get("gender") or ""),
        str(candidate.get("looking_for") or "everyone"),
        str(candidate.get("gender") or ""),
    ):
        return False
    decided = _openai_like(seed, candidate)
    if decided is not None:
        return decided
    return heuristic_like(seed, candidate)
