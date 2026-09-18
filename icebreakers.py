"""First-message chips for an empty match chat — OpenAI when possible, else heuristics."""

from __future__ import annotations

import json
import os
from database import Connection
import time
import urllib.error
import urllib.request
from typing import Any

from catalog import PROMPTS

_PROMPT_LABEL = {item["id"]: item["label"] for item in PROMPTS}

_FALLBACKS = [
    "параллельный плей или сначала текст?",
    "какой special interest на этой неделе?",
    "лучше коротко и по делу — ок?",
]


def _clip(text: str, limit: int = 110) -> str:
    text = " ".join(str(text or "").split())
    if len(text) > limit:
        return text[: limit - 1].rstrip() + "…"
    return text


def _heuristic_openers(peer: dict[str, Any], me: dict[str, Any] | None = None) -> list[str]:
    lines: list[str] = []
    prompts = peer.get("prompts") or []
    if prompts:
        first = prompts[0]
        label = _PROMPT_LABEL.get(str(first.get("id") or ""), "промпт")
        answer = str(first.get("answer") or "").strip()
        if answer:
            lines.append(_clip(f"про «{label}»: {answer[:40]} — расскажи ещё чуть-чуть"))
        else:
            lines.append(f"у тебя про «{label}» — расскажи ещё чуть-чуть")
    job = str(peer.get("job") or "").strip()
    if job:
        lines.append(_clip(f"{job} — это special interest или работа?"))
    communication = str(peer.get("communication") or "").strip()
    if communication:
        lines.append("напишу как ты просишь. сразу без small talk ок?")
    bio = str(peer.get("bio") or "")
    if "параллель" in bio.lower() or "parallel" in (peer.get("vibe") or []):
        lines.append("можно молчать в одном чате, или лучше сразу текст?")
    shared = set(peer.get("neuro") or []) & set((me or {}).get("neuro") or [])
    if shared:
        lines.append("у нас пересекается нейротип — как тебе удобнее писать?")
    for item in _FALLBACKS:
        if item not in lines:
            lines.append(item)
    return _uniq(lines, 3)


def _uniq(lines: list[str], n: int = 3) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for line in lines:
        text = _clip(line)
        if text and text not in seen:
            seen.add(text)
            unique.append(text)
        if len(unique) == n:
            break
    return unique


def _slim(profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": profile.get("name"),
        "age": profile.get("age"),
        "city": profile.get("city"),
        "job": (profile.get("job") or "")[:120],
        "bio": (profile.get("bio") or "")[:400],
        "communication": (profile.get("communication") or "")[:220],
        "intent": profile.get("intent") or (profile.get("intents") or ["dating"])[:1],
        "intents": profile.get("intents") or [],
        "neuro": profile.get("neuro") or [],
        "vibe": profile.get("vibe") or [],
        "prompts": [
            {
                "id": p.get("id"),
                "label": _PROMPT_LABEL.get(str(p.get("id") or ""), str(p.get("id") or "")),
                "answer": str(p.get("answer") or "")[:160],
            }
            for p in (profile.get("prompts") or [])[:3]
        ],
    }


def _openai_openers(peer: dict[str, Any], me: dict[str, Any] | None = None) -> list[str] | None:
    if os.environ.get("WIRING_OPENER_AI", "1").lower() in {"0", "off", "false", "no"}:
        return None
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        return None
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    payload = {
        "model": model,
        "temperature": 0.9,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "Ты пишешь первые сообщения на WIRING — знакомствах для нейроотличных. "
                    "Нужно ровно 3 коротких фразы от меня к человеку из «их_анкета».\n"
                    "Главное:\n"
                    "1) Спрашивай и комментируй ТОЛЬКО их анкету (био, промпты, job, communication, нейро/вайб). "
                    "Никогда не приписывай им мои увлечения, работу или детали из «моя_анкета». "
                    "«моя_анкета» — только чтобы мягко отметить пересечение («у меня тоже…»), "
                    "не чтобы спрашивать их про мои хобби.\n"
                    "2) Обращение только на «ты», с уважением и без фамильярности. "
                    "Запрещены «вы/Вас/Ваш» и канцелярит.\n"
                    "3) Тон: тёплый, дружеский, спокойный. Живой, но не панибратский; без флирта-шаблона, "
                    "без «привет», «как дела», эмодзи и пустых комплиментов.\n"
                    "4) Каждая фраза — одно сообщение 8–110 символов, можно сразу вопрос по их детали.\n"
                    "Ответь только JSON {\"openers\": [\"...\", \"...\", \"...\"]}."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "их_анкета": _slim(peer),
                        "моя_анкета": _slim(me or {}),
                        "напоминание": "вопросы только про их_анкету; моя_анкета — лишь для пересечений",
                    },
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
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["choices"][0]["message"]["content"]
        parsed = json.loads(text)
        raw = parsed.get("openers") or parsed.get("lines") or []
        if not isinstance(raw, list):
            return None
        lines = _uniq([str(x) for x in raw], 3)
        return lines if len(lines) >= 2 else None
    except (urllib.error.URLError, TimeoutError, KeyError, IndexError, TypeError, json.JSONDecodeError, OSError, ValueError):
        return None


def openers_for(peer: dict[str, Any], me: dict[str, Any] | None = None) -> list[str]:
    ai = _openai_openers(peer, me)
    if ai:
        return ai
    return _heuristic_openers(peer, me)


def ensure_opener_table(conn: Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_openers (
            user_id INTEGER NOT NULL,
            other_id INTEGER NOT NULL,
            lines TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, other_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (other_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )


def clear_openers(conn: Connection, uid: int, other_id: int) -> None:
    conn.execute(
        "DELETE FROM chat_openers WHERE (user_id = ? AND other_id = ?) OR (user_id = ? AND other_id = ?)",
        (uid, other_id, other_id, uid),
    )


def cached_openers(
    conn: Connection,
    uid: int,
    other_id: int,
    peer: dict[str, Any],
    me: dict[str, Any] | None = None,
) -> list[str]:
    ensure_opener_table(conn)
    row = conn.execute(
        "SELECT lines FROM chat_openers WHERE user_id = ? AND other_id = ?",
        (uid, other_id),
    ).fetchone()
    if row:
        try:
            cached = json.loads(row["lines"])
            if isinstance(cached, list) and cached:
                return _uniq([str(x) for x in cached], 3)
        except (TypeError, json.JSONDecodeError):
            pass
    lines = openers_for(peer, me)
    conn.execute(
        """
        INSERT INTO chat_openers (user_id, other_id, lines, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, other_id) DO UPDATE SET lines = excluded.lines, created_at = excluded.created_at
        """,
        (uid, other_id, json.dumps(lines, ensure_ascii=False), int(time.time())),
    )
    conn.commit()
    return lines
