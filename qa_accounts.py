"""Internal demo accounts: feed recycles faster and uses viewer-only «кого ищу» matching for debug."""
from __future__ import annotations

QA_FEED_EMAILS = frozenset(
    {
        "wiringremlin@gmail.com",
    }
)

QA_FEED_LIMIT = 30


def has_qa_feed(email: str) -> bool:
    return (email or "").strip().lower() in QA_FEED_EMAILS
