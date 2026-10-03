"""Worldwide discovery: bounded shortlist across every eligible profile.

No delivery reservations, random samples, or local probability percentages. The
whole eligible population is scanned in keyset batches; Jev sees at most 60
structured pairs. This is a shortlist heuristic, not a global optimality claim.
"""
from __future__ import annotations

import heapq
from typing import Any, Callable

from database import Connection, Row
from jev_ranker import _pair_signals, match_reasons, rank_profiles

SHORTLIST_SIZE = 60
SCAN_BATCH_SIZE = 256
TASTE_MIN_LIKES = 3


def recommendation_priority(viewer: dict, candidate: dict) -> int:
    """Deterministic retrieval priority, never a relationship probability."""
    signals = _pair_signals(viewer, candidate)
    return (
        8 * min(4, len(signals["shared_vibe"]))
        + 6 * min(3, signals["shared_intents_count"])
        + 2 * min(3, len(signals["shared_neuro"]))
        + 3 * int(signals["same_city"])
        + {"0-2": 2, "3-5": 1}.get(signals["age_gap_band"], 0)
    )


def _swipe_profiles(conn: Connection, viewer_id: int, direction: str, eligible: Callable[[Row], dict[str, Any] | None]) -> list[dict[str, Any]]:
    rows = conn.execute("""
        SELECT users.* FROM swipes
        JOIN users ON users.id = swipes.to_id
        WHERE swipes.from_id = ? AND swipes.direction = ?
          AND COALESCE(users.deleted_at, 0) = 0
        ORDER BY swipes.created_at DESC
        LIMIT 40
    """, (viewer_id, direction)).fetchall()
    profiles = []
    for row in rows:
        card = eligible(row)
        if card is not None:
            profiles.append(card)
    return profiles


def _taste_priority(likes: list[dict], passes: list[dict], candidate: dict) -> int:
    like_score = sum(recommendation_priority(liked, candidate) for liked in likes) / len(likes)
    pass_score = sum(recommendation_priority(passed, candidate) for passed in passes) / len(passes) if passes else 0
    return int(round(like_score * 10 - pass_score * 6))


def _nearest_like(likes: list[dict], candidate: dict) -> dict:
    return max(likes, key=lambda liked: (recommendation_priority(liked, candidate), -int(liked.get("id") or 0)))


def select_recommendations(
    conn: Connection, viewer: dict, eligible: Callable[[Row], dict[str, Any] | None],
) -> tuple[list[dict[str, Any]], str]:
    likes = _swipe_profiles(conn, int(viewer["id"]), "like", eligible)
    passes = _swipe_profiles(conn, int(viewer["id"]), "pass", eligible) if len(likes) >= TASTE_MIN_LIKES else []
    by_taste = len(likes) >= TASTE_MIN_LIKES
    shortlist = []
    cursor = 0
    while True:
        rows = conn.execute("""
            SELECT * FROM users
            WHERE id > ? AND id != ? AND COALESCE(deleted_at, 0) = 0
              AND age BETWEEN 18 AND 99 AND COALESCE(paused, 0) = 0
              AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.from_id = ? AND s.to_id = users.id)
              AND NOT EXISTS (SELECT 1 FROM feed_history h WHERE h.user_id = ?
                              AND h.other_id = users.id AND h.excluded_at IS NOT NULL)
              AND (EXISTS (SELECT 1 FROM photos p WHERE p.user_id = users.id) OR COALESCE(photo, '') != '')
            ORDER BY id LIMIT ?
        """, (cursor, viewer["id"], viewer["id"], viewer["id"], SCAN_BATCH_SIZE)).fetchall()
        if not rows:
            break
        cursor = int(rows[-1]["id"])
        for row in rows:
            card = eligible(row)
            if card is None:
                continue
            priority = _taste_priority(likes, passes, card) if by_taste else recommendation_priority(viewer, card)
            item = (priority, -int(card["id"]), card)
            if len(shortlist) < SHORTLIST_SIZE:
                heapq.heappush(shortlist, item)
            elif item[:2] > shortlist[0][:2]:
                heapq.heapreplace(shortlist, item)
    cards = [item[2] for item in sorted(shortlist, key=lambda item: item[:2], reverse=True)]
    if by_taste:
        source = "taste"
    else:
        ranked = rank_profiles(viewer, cards)
        source = "api" if ranked is not None else "local"
        cards = ranked if ranked is not None else cards
    for card in cards:
        card.pop("jev_match_pct", None)
        card.pop("jev_match_reasons", None)
        card.pop("jev_match_source", None)
        prototype = _nearest_like(likes, card) if by_taste else viewer
        card["recommendation_reasons"] = match_reasons(prototype, card)
    return cards, source
