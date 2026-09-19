"""PostgreSQL database layer. SQL uses ? placeholders throughout the app."""

from __future__ import annotations

import os
import re
from typing import Any, Iterable, Mapping, Sequence

import psycopg
from psycopg import errors as pg_errors
from psycopg.rows import dict_row

IntegrityError = pg_errors.IntegrityError
OperationalError = pg_errors.OperationalError

DEFAULT_DATABASE_URL = "postgresql://wiring_dev:wiring_dev@127.0.0.1:5433/wiring_dev"


def _load_env_if_needed() -> None:
    if os.environ.get("DATABASE_URL"):
        return
    env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.isfile(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip().strip("'\"")
                        if k and k not in os.environ:
                            os.environ[k] = v
        except OSError:
            pass


def get_database_url() -> str:
    _load_env_if_needed()
    url = (os.environ.get("DATABASE_URL") or "").strip()
    return url or DEFAULT_DATABASE_URL


DATABASE_URL = get_database_url()
USE_PG = True


def use_postgres() -> bool:
    return True


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


def _quote_read_column(sql: str) -> str:
    """PostgreSQL: unquoted `read` is a reserved word / invalid column name in some contexts."""
    return re.sub(r"(?<![\w\"])read(?=\s*(=|,|\)|$|\s))", '"read"', sql)


def adapt_sql(sql: str) -> str:
    # Literal % in SQL (e.g. LIKE '%@x') must be doubled for psycopg.
    sql = sql.replace("%", "%%")
    sql = sql.replace("?", "%s")
    return _quote_read_column(sql)


def adapt_ddl(sql: str) -> str:
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


class Row(Mapping[str, Any]):
    """Dict/mapping row wrapper that supports both key and integer indexing."""

    def __init__(self, data: dict[str, Any]) -> None:
        self._data = data
        self._keys = tuple(data.keys())

    def __getitem__(self, item: Any) -> Any:
        if isinstance(item, int):
            return self._data[self._keys[item]]
        return self._data[item]

    def __iter__(self):
        return iter(self._data)

    def __len__(self) -> int:
        return len(self._data)

    def keys(self):
        return self._data.keys()

    def values(self):
        return self._data.values()

    def items(self):
        return self._data.items()

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def __contains__(self, key: Any) -> bool:
        return key in self._data

    def __repr__(self) -> str:
        return f"Row({self._data!r})"


def _wrap_row(row: Any) -> Any:
    if row is None:
        return None
    if isinstance(row, Row):
        return row
    if isinstance(row, dict):
        return Row(row)
    if isinstance(row, Mapping):
        return Row(dict(row))
    return row


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


class Connection:
    """Connection wrapping a psycopg Connection with ? placeholders and lastrowid support."""

    def __init__(self, raw: psycopg.Connection) -> None:
        self._raw = raw

    def execute(self, sql: str, params: Sequence[Any] | None = None) -> Cursor:
        params = () if params is None else tuple(params)
        sql_exec = _maybe_returning(sql)
        sql_exec = adapt_ddl(sql_exec)
        cur = self._raw.cursor()
        cur.execute(sql_exec, params)
        lastrowid: int | None = None
        if "RETURNING" in sql_exec.upper():
            got = cur.fetchone()
            if got is not None:
                if isinstance(got, Mapping) and "id" in got:
                    lastrowid = int(got["id"])
                elif isinstance(got, (tuple, list)) and len(got) > 0:
                    lastrowid = int(got[0])
                elif hasattr(got, "__getitem__"):
                    try:
                        lastrowid = int(got["id"])
                    except Exception:
                        lastrowid = int(got[0])
        return Cursor(cur, lastrowid=lastrowid)

    def commit(self) -> None:
        self._raw.commit()

    def rollback(self) -> None:
        self._raw.rollback()

    def close(self) -> None:
        self._raw.close()

    def executescript(self, script: str) -> None:
        for chunk in script.split(";"):
            stmt = chunk.strip()
            if not stmt:
                continue
            self.execute(adapt_ddl(stmt))

    def executemany(self, sql: str, params_seq: Iterable[Sequence[Any]]) -> None:
        sql_exec = adapt_ddl(sql)
        with self._raw.cursor() as cur:
            cur.executemany(sql_exec, params_seq)


def connect(url_or_path: str | None = None) -> Connection:
    url = url_or_path if (url_or_path and url_or_path.startswith("postgres")) else get_database_url()
    raw = psycopg.connect(url, row_factory=dict_row)
    raw.autocommit = False
    return Connection(raw)


def open_request_connection(url_or_path: str | None = None) -> Connection:
    return connect(url_or_path)


def columns(conn: Connection, table: str) -> set[str]:
    rows = conn.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ?
        """,
        (table,),
    ).fetchall()
    return {str(r["column_name"]) for r in rows}


def ensure_column(conn: Connection, table: str, name: str, ddl: str) -> None:
    if name in columns(conn, table):
        return
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
    except OperationalError as exc:
        if "already exists" in str(exc).lower():
            return
        raise


def table_names(conn: Connection) -> set[str]:
    rows = conn.execute(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        """
    ).fetchall()
    return {str(r["table_name"]) for r in rows}
