"""Offline worldwide suggestions; explicit country-qualified manual places remain valid."""
from __future__ import annotations
import gzip, json, re, unicodedata
from functools import lru_cache
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parent/'resources/places'
_ROWS = None
_ROWS_LOCK = Lock()

def key(value: str) -> str:
    value = ''.join(c for c in unicodedata.normalize('NFKD', value.casefold().replace('ё', 'е')) if not unicodedata.combining(c))
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in value).split())

@lru_cache(maxsize=1)
def countries() -> dict:
    return json.loads((ROOT/'countries.json').read_text())

def rows() -> list:
    global _ROWS
    if _ROWS is None:
        # Load once even with concurrent Gunicorn threads; avoid a giant JSON text
        # allocation and Python's wide Unicode storage for multilingual aliases.
        with _ROWS_LOCK:
            if _ROWS is None:
                nations = {item['name']: item['name'] for item in countries().values()}
                loaded = []
                with gzip.open(ROOT/'world-cities.jsonl.gz', 'rt', encoding='utf-8') as source:
                    for line in source:
                        canonical, name, country, aliases, population = json.loads(line)
                        loaded.append((canonical, name, nations[country], ('|'+aliases+'|').encode('utf-8'), population))
                _ROWS = loaded
    return _ROWS

def has_alias(aliases: bytes, needle: str) -> bool:
    return b'|'+needle.encode('utf-8')+b'|' in aliases

def qualified_country(value: str) -> str:
    city, separator, country = value.rpartition(' · ')
    if separator and country in {item['name'] for item in countries().values()} and 2 <= len(city) <= 200 and any(c.isalpha() for c in city) and not re.search(r'[<>\x00-\x1f\x7f]', city):
        return country
    return ''

@lru_cache(maxsize=1)
def canonical_values() -> frozenset:
    return frozenset(row[0] for row in rows())

@lru_cache(maxsize=2048)
def resolve(value: str) -> str | None:
    if qualified_country(value): return value
    needle = key(value)
    if len(needle) < 2: return None
    for canonical, name, country, aliases, population in rows():
        if has_alias(aliases, needle): return canonical
    return None

@lru_cache(maxsize=512)
def search(query: str, country: str = '', limit: int = 40) -> tuple:
    needle = key(query)
    encoded = needle.encode('utf-8')
    exact, prefix, rest = [], [], []
    for canonical, name, nation, aliases, population in rows():
        if country and nation != country: continue
        if not needle or encoded in aliases:
            item = {'value': canonical, 'label': canonical, 'country': nation}
            if key(name) == needle or has_alias(aliases, needle): exact.append(item)
            elif key(name).startswith(needle): prefix.append(item)
            else: rest.append(item)
            if not needle and len(rest) + len(prefix) >= limit: break
    return tuple((exact + prefix + rest)[:limit])
