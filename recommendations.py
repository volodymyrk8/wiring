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


def select_recommendations(
    conn: Connection, viewer: dict, eligible: Callable[[Row], dict[str, Any] | None],
) -> tuple[list[dict[str, Any]], str]:
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
            item = (recommendation_priority(viewer, card), -int(card["id"]), card)
            if len(shortlist) < SHORTLIST_SIZE:
                heapq.heappush(shortlist, item)
            elif item[:2] > shortlist[0][:2]:
                heapq.heapreplace(shortlist, item)
    cards = [item[2] for item in sorted(shortlist, key=lambda item: item[:2], reverse=True)]
    ranked = rank_profiles(viewer, cards)
    source = "api" if ranked is not None else "local"
    cards = ranked if ranked is not None else cards
    for card in cards:
        card.pop("jev_match_pct", None)
        card.pop("jev_match_reasons", None)
        card.pop("jev_match_source", None)
        card["recommendation_reasons"] = match_reasons(viewer, card)
    return cards, source
