"""SQLite (default) or PostgreSQL via DATABASE_URL. SQL uses ? placeholders everywhere."""

from __future__ import annotations

import os
import re
import sqlite3
from typing import Any, Iterable, Mapping, Sequence, Union

DATABASE_URL = (os.environ.get("DATABASE_URL") or "").strip()
USE_PG = DATABASE_URL.startswith("postgres")

if USE_PG:
    import psycopg
    from psycopg import errors as pg_errors

    IntegrityError = pg_errors.IntegrityError
    OperationalError = pg_errors.OperationalError
else:
    IntegrityError = sqlite3.IntegrityError
    OperationalError = sqlite3.OperationalError

_INSERT_INTO = re.compile(r"^\s*INSERT\s+INTO\s+(\w+)", re.I | re.S)
_TABLES_WITH_SERIAL_ID = frozenset(
    {
        "users",
        "albums",
        "photos",
        "messages",
        "reports",
        "notifications",
        "support_tickets",
        "filter_events",
        "feature_tasks",
    }
)


def use_postgres() -> bool:
    return USE_PG


def _quote_read_column(sql: str) -> str:
    """PostgreSQL: unquoted `read` is not a valid column name in all contexts."""
    if not USE_PG:
        return sql
    return re.sub(r"(?<![\w\"])read(?=\s*(=|,|\)|$|\s))", '"read"', sql)


def adapt_sql(sql: str) -> str:
    if not USE_PG:
        return sql
    # Literal % in SQL (e.g. LIKE '%@x') must be doubled for psycopg.
    sql = sql.replace("%", "%%")
    sql = sql.replace("?", "%s")
    return _quote_read_column(sql)


def adapt_ddl(sql: str) -> str:
    if not USE_PG:
        return sql
    sql = adapt_sql(sql)
    sql = re.sub(
        r"\bid\s+INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b",
        "id BIGSERIAL PRIMARY KEY",
        sql,
        flags=re.I,
    )
    sql = re.sub(r"\bread\s+INTEGER\b", '"read" INTEGER', sql, flags=re.I)
    sql = re.sub(r"\(user_id,\s*read\)", '(user_id, "read")', sql, flags=re.I)
    return sql


def _maybe_returning(sql: str) -> str:
    if not USE_PG:
        return sql
    if "RETURNING" in sql.upper():
        return sql
    match = _INSERT_INTO.match(sql)
    if not match:
        return sql
    table = match.group(1).lower()
    if table not in _TABLES_WITH_SERIAL_ID:
        return sql
    stripped = sql.rstrip().rstrip(";")
    return f"{stripped} RETURNING id"


class Cursor:
    def __init__(self, raw: Any, lastrowid: int | None = None) -> None:
        self._raw = raw
        self._lastrowid = lastrowid

    @property
    def lastrowid(self) -> int:
        if self._lastrowid is not None:
            return int(self._lastrowid)
        if hasattr(self._raw, "lastrowid") and self._raw.lastrowid is not None:
            return int(self._raw.lastrowid)
        return 0

    @property
    def rowcount(self) -> int:
        return int(getattr(self._raw, "rowcount", -1))

    def fetchone(self) -> Any:
        row = self._raw.fetchone()
        return _wrap_row(row)

    def fetchall(self) -> list[Any]:
        return [_wrap_row(r) for r in self._raw.fetchall()]

    def __iter__(self):
        for row in self._raw:
            yield _wrap_row(row)


def _wrap_row(row: Any) -> Any:
    if row is None:
        return None
    if isinstance(row, sqlite3.Row):
        return row
    if isinstance(row, Mapping):
        return row
    if hasattr(row, "keys"):
        return row
    return row


class Connection:
    """Drop-in for sqlite3.Connection.execute() patterns used in the app."""

    def __init__(self, raw: Any) -> None:
        self._raw = raw

    def execute(self, sql: str, params: Sequence[Any] | None = None) -> Cursor:
        params = () if params is None else tuple(params)
        sql_exec = _maybe_returning(sql)
        sql_exec = adapt_ddl(sql_exec)
        if USE_PG:
            cur = self._raw.cursor()
            cur.execute(sql_exec, params)
            lastrowid: int | None = None
            if " RETURNING id" in sql_exec.upper():
                got = cur.fetchone()
                if got is not None:
                    lastrowid = int(got[0] if not isinstance(got, Mapping) else got["id"])
            return Cursor(cur, lastrowid=lastrowid)
        cur = self._raw.execute(sql_exec, params)
        return Cursor(cur)

    def commit(self) -> None:
        self._raw.commit()

    def rollback(self) -> None:
        self._raw.rollback()

    def close(self) -> None:
        self._raw.close()

    def executescript(self, script: str) -> None:
        if not USE_PG:
            self._raw.executescript(script)
            return
        for chunk in script.split(";"):
            stmt = chunk.strip()
            if not stmt:
                continue
            self.execute(adapt_ddl(stmt))

    def executemany(self, sql: str, params_seq: Iterable[Sequence[Any]]) -> None:
        sql_exec = adapt_ddl(sql)
        if USE_PG:
            with self._raw.cursor() as cur:
                cur.executemany(sql_exec, params_seq)
            return
        self._raw.executemany(sql_exec, params_seq)


def connect(db_path: str) -> Connection:
    if USE_PG:
        raw = psycopg.connect(DATABASE_URL, row_factory=psycopg.rows.dict_row)
        raw.autocommit = False
        return Connection(raw)
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    raw = sqlite3.connect(db_path)
    raw.row_factory = sqlite3.Row
    raw.execute("PRAGMA foreign_keys = ON")
    return Connection(raw)


def open_request_connection(db_path: str) -> Connection:
    conn = connect(db_path)
    if not USE_PG:
        conn.execute("PRAGMA journal_mode = WAL")
    return conn


def columns(conn: Connection, table: str) -> set[str]:
    if USE_PG:
        rows = conn.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ?
            """,
            (table,),
        ).fetchall()
        return {str(r["column_name"]) for r in rows}
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def ensure_column(conn: Connection, table: str, name: str, ddl: str) -> None:
    if name in columns(conn, table):
        return
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
    except OperationalError as exc:
        msg = str(exc).lower()
        if USE_PG and "already exists" in msg:
            return
        if not USE_PG and "duplicate column" in msg:
            return
        raise


def table_names(conn: Connection) -> set[str]:
    if USE_PG:
        rows = conn.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            """
        ).fetchall()
        return {str(r["table_name"]) for r in rows}
    return {str(r[0]) for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()}


Row = Union[sqlite3.Row, Mapping[str, Any]]
