"""Shared message reactions for web and native clients."""
from __future__ import annotations

from database import Connection

REACTIONS = ("❤️", "👍", "😂", "😮", "😢", "🎉")


def reactions_for(conn: Connection, message_ids: list[int], uid: int) -> dict:
    result = {}
    if not message_ids:
        return result
    marks = ', '.join('?' for _ in message_ids)
    rows = conn.execute(
        f"SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN ({marks})",
        tuple(message_ids),
    ).fetchall()
    for row in rows:
        groups = result.setdefault(int(row['message_id']), {})
        group = groups.setdefault(row['emoji'], {'emoji': row['emoji'], 'count': 0, 'mine': False})
        group['count'] += 1
        group['mine'] = group['mine'] or int(row['user_id']) == uid
    return {mid: [groups[emoji] for emoji in REACTIONS if emoji in groups] for mid, groups in result.items()}


def set_reaction(conn: Connection, message_id: int, uid: int, emoji: str | None) -> list:
    if emoji is None:
        conn.execute('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?', (message_id, uid))
    else:
        conn.execute(
            '''INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)
               ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji''',
            (message_id, uid, emoji),
        )
    return reactions_for(conn, [message_id], uid).get(message_id, [])
