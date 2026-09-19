"""Read one private Telegram group and create WIRING task drafts.

This is a separate, opt-in process. It uses a local MTProto user session,
reads message text only, and never sends, edits, forwards, or deletes a
Telegram message. Run the login and group-list commands manually on the
server where the WIRING database lives; keep the session file there.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

from database import connect as db_connect
from support_triage import create_task, ensure_task_tables

try:
    from telethon import TelegramClient
except ImportError:  # pragma: no cover - exercised only on an uninstalled worker
    TelegramClient = None  # type: ignore[assignment,misc]


BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = os.environ.get("DATABASE_URL", "")
SESSION_PATH = os.environ.get("TELEGRAM_SESSION_PATH", str(BASE_DIR / "data" / "telegram" / "wiring"))


def _required_env(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        raise RuntimeError(f"не задана настройка {name}")
    return value


def _api_id() -> int:
    try:
        return int(_required_env("TELEGRAM_API_ID"))
    except ValueError as exc:
        raise RuntimeError("TELEGRAM_API_ID должен быть числом") from exc


def _client() -> "TelegramClient":
    if TelegramClient is None:
        raise RuntimeError("не установлен Telethon: установи зависимости проекта")
    Path(SESSION_PATH).parent.mkdir(parents=True, exist_ok=True)
    old_umask = os.umask(0o077)
    try:
        return TelegramClient(SESSION_PATH, _api_id(), _required_env("TELEGRAM_API_HASH"))
    finally:
        os.umask(old_umask)


def _lock_session_files() -> None:
    """Keep the account session readable only by the process owner."""
    session = Path(SESSION_PATH)
    for candidate in session.parent.glob(session.name + "*"):
        try:
            candidate.chmod(0o600)
        except OSError:
            pass


def _db():
    conn = db_connect()
    ensure_task_tables(conn)
    return conn


async def _authorized(client: "TelegramClient", interactive: bool = False) -> None:
    await client.connect()
    if await client.is_user_authorized():
        return
    if not interactive:
        await client.disconnect()
        raise RuntimeError("серверный Telegram-клиент ещё не авторизован; сначала запусти команду login вручную")
    # Telethon asks for the phone, login code, and (if enabled) 2FA password
    # in this terminal. Nothing is printed or sent to the WIRING app.
    await client.start()


async def login() -> None:
    client = _client()
    try:
        await _authorized(client, interactive=True)
        print("Telegram подключён локально. Сессию оставь на сервере и не пересылай в чат.")
    finally:
        await client.disconnect()
        _lock_session_files()


async def list_groups() -> None:
    client = _client()
    try:
        await _authorized(client, interactive=False)
        async for dialog in client.iter_dialogs():
            if dialog.is_group or dialog.is_channel:
                print(f"{dialog.id}\t{dialog.title}")
    finally:
        await client.disconnect()


async def ingest_once() -> int:
    group_id = _required_env("TELEGRAM_GROUP_ID")
    client = _client()
    conn = _db()
    imported = 0
    try:
        await _authorized(client, interactive=False)
        entity = await client.get_entity(int(group_id))
        cursor_row = conn.execute("SELECT last_message_id FROM telegram_cursors WHERE chat_id = ?", (group_id,)).fetchone()
        last_id = int(cursor_row["last_message_id"]) if cursor_row else 0
        try:
            limit = max(1, min(int(os.environ.get("TELEGRAM_IMPORT_LIMIT", "200")), 1000))
        except ValueError:
            limit = 200
        newest = last_id
        async for message in client.iter_messages(entity, min_id=last_id, reverse=True, limit=limit):
            newest = max(newest, int(message.id or 0))
            body = str(getattr(message, "message", "") or "").strip()
            if not body:
                continue
            task = create_task(
                conn,
                source_type="telegram",
                source_id=f"{group_id}:{message.id}",
                text=body,
                source_chat=str(getattr(entity, "title", "приватная группа") or "приватная группа"),
                source_author=str(getattr(message, "sender_id", "") or "участник"),
                source_created_at=int(message.date.timestamp()) if getattr(message, "date", None) else 0,
            )
            if task:
                imported += 1
        if newest > last_id:
            conn.execute(
                "INSERT INTO telegram_cursors (chat_id, last_message_id, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(chat_id) DO UPDATE SET last_message_id = excluded.last_message_id, updated_at = excluded.updated_at",
                (group_id, newest, int(time.time())),
            )
        conn.commit()
        return imported
    finally:
        conn.close()
        await client.disconnect()


async def poll() -> None:
    try:
        interval = max(30, int(os.environ.get("TELEGRAM_POLL_SECONDS", "120")))
    except ValueError:
        interval = 120
    while True:
        count = await ingest_once()
        if count:
            print(f"добавлено черновиков: {count}", flush=True)
        await asyncio.sleep(interval)


def main() -> int:
    parser = argparse.ArgumentParser(description="WIRING Telegram read-only task importer")
    parser.add_argument("command", choices=("login", "list-groups", "once", "poll"))
    args = parser.parse_args()
    try:
        if args.command == "login":
            asyncio.run(login())
        elif args.command == "list-groups":
            asyncio.run(list_groups())
        elif args.command == "once":
            print(f"добавлено черновиков: {asyncio.run(ingest_once())}")
        else:
            asyncio.run(poll())
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        print(f"Telegram-воркер остановлен: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
