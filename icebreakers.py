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
from i18n import tr, get_language

_PROMPT_LABEL = {item["id"]: item["label"] for item in PROMPTS}
_OPENER_VERSION = 3

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
            lines.append(_clip(tr("про «{0}»: {1} — расскажи ещё чуть-чуть", tr(label), answer[:40])))
        else:
            lines.append(tr("у тебя про «{0}» — расскажи ещё чуть-чуть", tr(label)))
    job = str(peer.get("job") or "").strip()
    if job:
        lines.append(_clip(tr("{0} — это special interest или работа?", job)))
    communication = str(peer.get("communication") or "").strip()
    if communication:
        lines.append(tr("напишу как ты просишь. сразу без small talk ок?"))
    bio = str(peer.get("bio") or "")
    if "параллель" in bio.lower() or "parallel" in (peer.get("vibe") or []):
        lines.append(tr("можно молчать в одном чате, или лучше сразу текст?"))
    shared = set(peer.get("neuro") or []) & set((me or {}).get("neuro") or [])
    if shared:
        lines.append(tr("у нас пересекается нейротип — как тебе удобнее писать?"))
    for fallback in _FALLBACKS:
        item = tr(fallback)
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


def _gender(profile: dict[str, Any]) -> str:
    gender = profile.get("gender")
    return gender if gender in ("man", "woman") else "hidden"


def _slim(profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": profile.get("name"),
        "gender": _gender(profile),
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
                    "5) Род обращения определяй только по gender в «их_анкета»: woman — женский, man — мужской. "
                    "Род фраз от первого лица определяй только по gender в «моя_анкета». "
                    "Не угадывай род по имени, профессии или увлечениям. "
                    "При hidden используй только нейтральные формулировки без указания рода. "
                    "Предпочитай нейтральные вопросы для всех: «Что привело тебя в психологию?» "
                    "вместо «Как ты пришёл в психологию?».\n" +
                    ("Пиши все три сообщения только по-английски. " if get_language() == "en" else "Пиши все три сообщения по-русски. ") +
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


CHAT_OPENER_SILENCE_SEC = 3 * 24 * 60 * 60


def last_visible_message_at(conn: Connection, uid: int, other_id: int) -> int | None:
    row = conn.execute(
        """
        SELECT MAX(created_at) AS ts FROM messages
        WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))
          AND COALESCE(deleted_at, 0) = 0
        """,
        (uid, other_id, other_id, uid),
    ).fetchone()
    ts = row["ts"] if row else None
    return int(ts) if ts else None


def should_offer_chat_openers(
    conn: Connection,
    uid: int,
    other_id: int,
    *,
    now: int | None = None,
) -> tuple[bool, str]:
    """Whether to show icebreaker buttons; reason is ``empty``, ``silence``, or ````."""
    last = last_visible_message_at(conn, uid, other_id)
    if last is None:
        return True, "empty"
    now_ts = int(time.time()) if now is None else now
    if now_ts - last >= CHAT_OPENER_SILENCE_SEC:
        return True, "silence"
    return False, ""


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
            if (isinstance(cached, dict)
                    and cached.get("version") == _OPENER_VERSION
                    and cached.get("language") == get_language()
                    and cached.get("genders") == [_gender(peer), _gender(me or {})]
                    and isinstance(cached.get("lines"), list)
                    and cached["lines"]):
                return _uniq([str(x) for x in cached["lines"]], 3)
        except (TypeError, json.JSONDecodeError):
            pass
    lines = openers_for(peer, me)
    cache = {
        "version": _OPENER_VERSION,
        "language": get_language(),
        "genders": [_gender(peer), _gender(me or {})],
        "lines": lines,
    }
    conn.execute(
        """
        INSERT INTO chat_openers (user_id, other_id, lines, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, other_id) DO UPDATE SET lines = excluded.lines, created_at = excluded.created_at
        """,
        (uid, other_id, json.dumps(cache, ensure_ascii=False), int(time.time())),
    )
    conn.commit()
    return lines
