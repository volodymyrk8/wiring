"""Server-side Jev ranking for the single-account feed experiment."""
from __future__ import annotations

import json
import math
import os
from typing import Any
from urllib.request import Request, urlopen


JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone"
JEV_TIMEOUT_SECONDS = 3


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


def _intents(profile: Any) -> set[str]:
    values = profile.get("intents") or ([profile.get("intent")] if profile.get("intent") else [])
    return {str(item) for item in values[:8] if item}


def _compatibility_features(viewer: Any, candidate: Any) -> dict[str, Any]:
    """Derive coarse pair signals locally; do not send profile fields or identifiers."""
    try:
        age_gap = abs(int(viewer["age"] or 0) - int(candidate["age"] or 0))
    except (TypeError, ValueError):
        age_gap = 99
    age_gap_band = "0-2" if age_gap <= 2 else "3-5" if age_gap <= 5 else "6-10" if age_gap <= 10 else "11+"
    viewer_city = str(viewer["city"] or "").strip().casefold()
    candidate_city = str(candidate["city"] or "").strip().casefold()
    shared_intents = len(_intents(viewer) & _intents(candidate))
    return {
        "same_city": bool(viewer_city and candidate_city and viewer_city == candidate_city),
        "age_gap_band": age_gap_band,
        "shared_intents": "2+" if shared_intents >= 2 else str(shared_intents),
    }


def rank_profiles(viewer: Any, cards: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    """Rank one delivered page; return None on any provider or response failure."""
    if len(cards) < 2:
        return cards
    api_key = (os.environ.get("JEV_API_KEY") or "").strip()
    if not api_key:
        return None

    try:
        state = {
            f"pair_{index}": _compatibility_features(viewer, card)
            for index, card in enumerate(cards)
        }
        questions = {
            f"candidate_{index}": {
                "type": "noul",
                "instructions": (
                    f"Estimate the chance that this pair would mutually choose to like each other using only the "
                    f"coarse compatibility signals for pair_{index}. Existing eligibility and mutual-preference "
                    "rules have already been applied. Treat same-city as a soft signal, not a hard constraint. "
                    "Do not infer any profile details or use factors not present in the signals."
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
            scored.append((score, index, card))
        scored.sort(key=lambda item: (-item[0], item[1]))
        return [card for _, _, card in scored]
    except Exception:
        return None
