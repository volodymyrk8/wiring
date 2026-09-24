"""Server-side Jev ranking for the single-account feed experiment."""
from __future__ import annotations

import json
import math
import os
from typing import Any
from urllib.request import Request, urlopen

from catalog import INTENTS, NEURO, VIBE

JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone"
JEV_TIMEOUT_SECONDS = 4

_NEURO_LABEL = {item["id"]: item["label"] for item in NEURO}
_VIBE_LABEL = {item["id"]: item["label"] for item in VIBE}
_INTENT_LABEL = {item["id"]: item["label"] for item in INTENTS}


def _configured_beta_user_id() -> int | None:
    raw = (os.environ.get("JEV_BETA_USER_ID") or "").strip()
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def jev_access(user_id: int) -> tuple[bool, bool]:
    """Return (is_allowlisted, service_is_configured); fail closed by default."""
    beta_user_id = _configured_beta_user_id()
    allowlisted = beta_user_id is not None and beta_user_id == int(user_id)
    configured = bool((os.environ.get("JEV_API_KEY") or "").strip())
    return allowlisted, configured


def _tag_list(profile: Any, key: str) -> list[str]:
    raw = profile.get(key) if isinstance(profile, dict) else None
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw[:24]:
        tag = str(item or "").strip()
        if tag and tag not in seen:
            seen.add(tag)
            out.append(tag)
    return out


def _intents(profile: Any) -> set[str]:
    values = profile.get("intents") or ([profile.get("intent")] if profile.get("intent") else [])
    return {str(item) for item in values[:8] if item}


def _pair_signals(viewer: Any, candidate: Any) -> dict[str, Any]:
    """Structured pair state for Jev — catalog tag ids only, no names or free text."""
    try:
        age_gap = abs(int(viewer.get("age") or 0) - int(candidate.get("age") or 0))
    except (TypeError, ValueError):
        age_gap = 99
    age_gap_band = "0-2" if age_gap <= 2 else "3-5" if age_gap <= 5 else "6-10" if age_gap <= 10 else "11+"
    viewer_city = str(viewer.get("city") or "").strip().casefold()
    candidate_city = str(candidate.get("city") or "").strip().casefold()
    viewer_neuro = _tag_list(viewer, "neuro")
    candidate_neuro = _tag_list(candidate, "neuro")
    viewer_vibe = _tag_list(viewer, "vibe")
    candidate_vibe = _tag_list(candidate, "vibe")
    shared_neuro = sorted(set(viewer_neuro) & set(candidate_neuro))
    shared_vibe = sorted(set(viewer_vibe) & set(candidate_vibe))
    shared_intent_ids = sorted(_intents(viewer) & _intents(candidate))
    return {
        "same_city": bool(viewer_city and candidate_city and viewer_city == candidate_city),
        "age_gap_band": age_gap_band,
        "viewer_neuro": viewer_neuro,
        "candidate_neuro": candidate_neuro,
        "shared_neuro": shared_neuro,
        "viewer_vibe": viewer_vibe,
        "candidate_vibe": candidate_vibe,
        "shared_vibe": shared_vibe,
        "shared_intent_ids": shared_intent_ids,
        "shared_intents_count": len(shared_intent_ids),
    }


def match_reasons(viewer: Any, candidate: Any, *, max_items: int = 3) -> list[str]:
    """Human-readable reasons shown in the feed (derived from the same signals Jev sees)."""
    signals = _pair_signals(viewer, candidate)
    reasons: list[str] = []

    shared_neuro = signals["shared_neuro"]
    if shared_neuro:
        labels = [_NEURO_LABEL.get(tag, tag) for tag in shared_neuro[:4]]
        suffix = f" (+{len(shared_neuro) - 4})" if len(shared_neuro) > 4 else ""
        reasons.append(f"Общие диагнозы: {', '.join(labels)}{suffix}")

    shared_vibe = signals["shared_vibe"]
    if shared_vibe and len(reasons) < max_items:
        labels = [_VIBE_LABEL.get(tag, tag) for tag in shared_vibe[:3]]
        reasons.append(f"Совпадает вайб: {', '.join(labels)}")

    if signals["same_city"] and len(reasons) < max_items:
        reasons.append("Один город — проще встретиться офлайн")

    shared_intents = signals["shared_intent_ids"]
    if shared_intents and len(reasons) < max_items:
        labels = [_INTENT_LABEL.get(tag, tag) for tag in shared_intents[:3]]
        reasons.append(f"Схожие цели: {', '.join(labels)}")

    if signals["age_gap_band"] in {"0-2", "3-5"} and len(reasons) < max_items:
        reasons.append("Близкий возраст")

    if not reasons:
        reasons.append("Jev учёл сочетание ваших отметок в анкетах")

    return reasons[:max_items]


def _attach_jev_fields(
    card: dict[str, Any],
    probability: float,
    viewer: Any,
    *,
    source: str = "local",
) -> dict[str, Any]:
    enriched = dict(card)
    enriched["jev_match_pct"] = max(0, min(100, int(round(probability * 100))))
    enriched["jev_match_reasons"] = match_reasons(viewer, card)
    enriched["jev_match_source"] = source
    return enriched


def local_match_probability(viewer: Any, candidate: Any) -> float:
    """Fallback 0–1 score from the same structured signals when Jev API is unavailable."""
    signals = _pair_signals(viewer, candidate)
    probability = 0.48
    probability += 0.1 * min(3, len(signals["shared_neuro"]))
    probability += 0.05 * min(4, len(signals["shared_vibe"]))
    if signals["same_city"]:
        probability += 0.07
    if signals["age_gap_band"] == "0-2":
        probability += 0.06
    elif signals["age_gap_band"] == "3-5":
        probability += 0.04
    elif signals["age_gap_band"] == "11+":
        probability -= 0.04
    if signals["shared_intents_count"] >= 2:
        probability += 0.06
    elif signals["shared_intents_count"] == 1:
        probability += 0.03
    pair_key = f"{viewer.get('id', '')}:{candidate.get('id', '')}"
    probability += (hash(pair_key) % 9) * 0.008 - 0.032
    return max(0.35, min(0.92, probability))


def prepare_jev_feed(
    viewer: Any,
    cards: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], bool, str]:
    """Attach match % + reasons; reorder when Jev API succeeds. scores_source: api | local."""
    if not cards:
        return [], False, "none"
    ranked = rank_profiles(viewer, cards) if len(cards) >= 2 else None
    if ranked is not None:
        return ranked, True, "api"
    local_cards = [
        _attach_jev_fields(card, local_match_probability(viewer, card), viewer, source="local")
        for card in cards
    ]
    local_cards.sort(key=lambda item: (-int(item.get("jev_match_pct") or 0), int(item.get("id") or 0)))
    return local_cards, False, "local"


def rank_profiles(viewer: Any, cards: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    """Rank one delivered page; return None on any provider or response failure."""
    if len(cards) < 2:
        return None
    api_key = (os.environ.get("JEV_API_KEY") or "").strip()
    if not api_key:
        return None

    try:
        state = {f"pair_{index}": _pair_signals(viewer, card) for index, card in enumerate(cards)}
        questions = {
            f"candidate_{index}": {
                "type": "noul",
                "instructions": (
                    f"Estimate the probability that this pair would mutually choose to like each other "
                    f"using only the structured signals in pair_{index}. "
                    "Weight shared_neuro and shared_vibe strongly when present; viewer_neuro and candidate_neuro "
                    "lists are full diagnosis tag ids from the catalog (may be empty). "
                    "Use same_city, age_gap_band and shared_intent_ids as softer signals. "
                    "Eligibility and mutual gender/looking rules are already satisfied. "
                    "Do not invent tags or profile details absent from the signals."
                ),
                "criteria": {
                    "true": "Both people would likely choose to like each other after viewing each other's profile.",
                    "false": "At least one person would likely not choose to like the other.",
                },
            }
            for index in range(len(cards))
        }
        payload = json.dumps(
            {"model": (os.environ.get("JEV_MODEL") or "jev-latest").strip(), "state": state, "questions": questions},
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        request = Request(
            JEV_ENDPOINT,
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        with urlopen(request, timeout=JEV_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                return None
            raw = response.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            return None
        result = json.loads(raw.decode("utf-8"))
        answers = result.get("answers") if isinstance(result, dict) else None
        if not isinstance(answers, dict):
            return None

        scored: list[tuple[float, int, dict[str, Any]]] = []
        for index, card in enumerate(cards):
            answer = answers.get(f"candidate_{index}")
            probability = answer.get("noul") if isinstance(answer, dict) and answer.get("type") == "noul" else None
            if isinstance(probability, bool) or not isinstance(probability, (int, float)):
                return None
            score = float(probability)
            if not math.isfinite(score) or not 0 <= score <= 1:
                return None
            scored.append((score, index, _attach_jev_fields(card, score, viewer, source="api")))
        scored.sort(key=lambda item: (-item[0], item[1]))
        return [card for _, _, card in scored]
    except Exception:
        return None
