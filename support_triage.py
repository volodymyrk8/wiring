"""Turn support messages into reviewable product-task drafts.

The module is deliberately local and deterministic. It does not call an AI
service and it never sends a message back to Telegram. A human approves a
candidate in the admin board before it can be handed to an implementation
workflow.
"""

from __future__ import annotations

import hashlib
import os
import re
from database import Connection
import time
from typing import Any


TASK_STATUSES = ("candidate", "approved", "rejected", "filtered", "duplicate", "done")
DEFAULT_THRESHOLD = 6.0

_SPACE_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[^\w\s]+", re.UNICODE)
_REQUEST_WORDS = (
    "добав", "сдела", "нужн", "хочу", "можн", "убра", "исправ", "почин",
    "поменя", "улучш", "не работает", "слом", "ошиб", "баг", "add", "fix",
    "remove", "change", "want", "need", "please",
)
_NOISE = {
    "ага", "ок", "окей", "спасибо", "понятно", "ясно", "лол", "круто", "кайф",
    "угу", "да", "нет", "+1", "👍", "❤️", "❤", "...", "-",
}


def task_threshold() -> float:
    """Return the score at which a message becomes a reviewable candidate."""
    try:
        value = float(os.environ.get("SUPPORT_TASK_THRESHOLD", str(DEFAULT_THRESHOLD)))
    except (TypeError, ValueError):
        value = DEFAULT_THRESHOLD
    return max(0.0, min(10.0, value))


def ensure_task_tables(conn: Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS feature_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            source_chat TEXT NOT NULL DEFAULT '',
            source_author TEXT NOT NULL DEFAULT '',
            source_created_at INTEGER NOT NULL DEFAULT 0,
            raw_text TEXT NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            impact INTEGER NOT NULL DEFAULT 1,
            reach INTEGER NOT NULL DEFAULT 1,
            effort INTEGER NOT NULL DEFAULT 3,
            confidence INTEGER NOT NULL DEFAULT 1,
            score REAL NOT NULL DEFAULT 0,
            threshold REAL NOT NULL DEFAULT 6,
            status TEXT NOT NULL DEFAULT 'filtered',
            duplicate_of INTEGER,
            approved_at INTEGER,
            approved_by TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            dedupe_key TEXT NOT NULL,
            FOREIGN KEY (duplicate_of) REFERENCES feature_tasks(id) ON DELETE SET NULL,
            UNIQUE (source_type, source_id)
        );
        CREATE INDEX IF NOT EXISTS idx_feature_tasks_board
            ON feature_tasks(status, score DESC, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_feature_tasks_dedupe
            ON feature_tasks(dedupe_key, status);
        CREATE TABLE IF NOT EXISTS telegram_cursors (
            chat_id TEXT PRIMARY KEY,
            last_message_id INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
        );
        """
    )


def normalize_text(text: str) -> str:
    value = _SPACE_RE.sub(" ", str(text or "").replace("\u00a0", " ")).strip()
    return value[:4000]


def _dedupe_key(text: str) -> str:
    cleaned = _PUNCT_RE.sub(" ", text.casefold())
    cleaned = _SPACE_RE.sub(" ", cleaned).strip()
    return hashlib.sha256(cleaned.encode("utf-8")).hexdigest()[:32]


def _is_noise(text: str) -> bool:
    folded = text.casefold().strip()
    if not folded or folded in _NOISE:
        return True
    if len(folded) < 8 and not any(word in folded for word in _REQUEST_WORDS):
        return True
    # A short acknowledgement without a request signal is not a product task.
    if len(folded) < 28 and not any(word in folded for word in _REQUEST_WORDS):
        return True
    return False


def _category(text: str) -> str:
    folded = text.casefold()
    if any(word in folded for word in ("не работает", "слом", "ошиб", "баг", "падает", "не откры", "не груз", "fix")):
        return "баг"
    if any(word in folded for word in ("текст", "слово", "описан", "перевод", "опечат", "глоссар", "copy")):
        return "контент"
    if any(word in folded for word in ("кноп", "экран", "интерфейс", "дизайн", "мобил", "верст", "цвет", "размер", "удобн", "ui", "ux")):
        return "интерфейс"
    if any(word in folded for word in ("добав", "хочу", "нужн", "можн", "фича", "функц", "add", "want", "need")):
        return "фича"
    return "другое"


def _signals(text: str, category: str) -> tuple[int, int, int, int]:
    folded = text.casefold()
    impact = 3
    if category == "баг":
        impact = 4
    if any(word in folded for word in ("невозможно", "никто", "всем", "теряем", "оплата", "безопас")):
        impact = 5
    reach = 3
    if any(word in folded for word in ("все", "кажд", "пользовател", "мног", "у всех", "everyone", "users")):
        reach = 5
    elif any(word in folded for word in ("мне", "у меня", "лично", "my ")):
        reach = 2
    effort = 3
    if any(word in folded for word in ("интеграц", "телеграм", "аналитик", "платеж", "миграц", "api", "backend")):
        effort = 5
    elif category == "контент":
        effort = 1
    elif category == "интерфейс":
        effort = 2
    confidence = min(5, max(1, len(text) // 90 + 1))
    if any(word in folded for word in _REQUEST_WORDS):
        confidence = min(5, confidence + 1)
    return impact, reach, effort, confidence


def _score(impact: int, reach: int, effort: int, confidence: int) -> float:
    value = (impact * 0.35 + reach * 0.25 + (6 - effort) * 0.20 + confidence * 0.20) * 2
    return round(max(0.0, min(10.0, value)), 1)


def _title(text: str) -> str:
    first = re.split(r"[.!?\n]", text, maxsplit=1)[0].strip(" —:-")
    if len(first) < 8:
        first = text
    return first[:140]


def create_task(
    conn: Connection,
    *,
    source_type: str,
    source_id: str | int,
    text: str,
    source_chat: str = "",
    source_author: str = "",
    source_created_at: int = 0,
) -> dict[str, Any] | None:
    """Create one draft from a message, returning its public board fields.

    Existing source messages are idempotent. Exact normalized duplicates are
    stored for audit but marked as ``duplicate`` so they do not enter the work
    queue twice.
    """
    raw = normalize_text(text)
    if _is_noise(raw):
        return None
    source_type = (source_type or "other").strip()[:32] or "other"
    source_id = str(source_id)
    existing = conn.execute(
        "SELECT * FROM feature_tasks WHERE source_type = ? AND source_id = ?",
        (source_type, source_id),
    ).fetchone()
    if existing:
        return dict(existing)

    category = _category(raw)
    impact, reach, effort, confidence = _signals(raw, category)
    score = _score(impact, reach, effort, confidence)
    threshold = task_threshold()
    dedupe_key = _dedupe_key(raw)
    duplicate = conn.execute(
        """
        SELECT id FROM feature_tasks
        WHERE dedupe_key = ? AND status NOT IN ('rejected', 'duplicate')
        ORDER BY id ASC LIMIT 1
        """,
        (dedupe_key,),
    ).fetchone()
    status = "duplicate" if duplicate else ("candidate" if score >= threshold else "filtered")
    now = int(time.time())
    cur = conn.execute(
        """
        INSERT INTO feature_tasks (
            source_type, source_id, source_chat, source_author, source_created_at,
            raw_text, title, category, impact, reach, effort, confidence, score,
            threshold, status, duplicate_of, created_at, updated_at, dedupe_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            source_type,
            source_id[:160],
            str(source_chat or "")[:160],
            str(source_author or "")[:160],
            int(source_created_at or 0),
            raw,
            _title(raw),
            category,
            impact,
            reach,
            effort,
            confidence,
            score,
            threshold,
            status,
            int(duplicate["id"]) if duplicate else None,
            now,
            now,
            dedupe_key,
        ),
    )
    row = conn.execute("SELECT * FROM feature_tasks WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row) if row else None


def list_tasks(conn: Connection, limit: int = 100) -> list[Any]:
    ensure_task_tables(conn)
    return conn.execute(
        """
        SELECT * FROM feature_tasks
        ORDER BY
            CASE status
                WHEN 'candidate' THEN 0
                WHEN 'approved' THEN 1
                WHEN 'filtered' THEN 2
                WHEN 'duplicate' THEN 3
                ELSE 4
            END,
            score DESC, updated_at DESC, id DESC
        LIMIT ?
        """,
        (max(1, min(int(limit), 300)),),
    ).fetchall()


def task_counts(conn: Connection) -> dict[str, int]:
    ensure_task_tables(conn)
    rows = conn.execute("SELECT status, COUNT(*) AS n FROM feature_tasks GROUP BY status").fetchall()
    result = {status: 0 for status in TASK_STATUSES}
    result.update({str(row["status"]): int(row["n"]) for row in rows})
    return result


def triage_support_tickets(conn: Connection, limit: int = 100) -> int:
    """Backfill the board from existing WIRING support form submissions."""
    ensure_task_tables(conn)
    tickets = conn.execute(
        "SELECT id, name, email, body, created_at FROM support_tickets ORDER BY id ASC LIMIT ?",
        (max(1, min(int(limit), 500)),),
    ).fetchall()
    created = 0
    for ticket in tickets:
        before = conn.execute("SELECT 1 FROM feature_tasks WHERE source_type = 'support' AND source_id = ?", (str(ticket["id"]),)).fetchone()
        task = create_task(
            conn,
            source_type="support",
            source_id=ticket["id"],
            text=str(ticket["body"] or ""),
            source_chat="форма поддержки",
            source_author=str(ticket["name"] or ticket["email"] or "гость"),
            source_created_at=int(ticket["created_at"] or 0),
        )
        if task and before is None:
            created += 1
    return created
