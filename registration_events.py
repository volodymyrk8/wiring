"""Transactional signup facts and consented Yandex Measurement Protocol delivery.

One fact per account. Historical facts are never exported. Ambiguous external
deliveries are held for reconciliation rather than retried and double-counted.
"""
from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass, field
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError

from itsdangerous import URLSafeTimedSerializer, BadSignature

GOAL = "registration_success"
MAX_AGE = 12 * 3600
CLIENT_ID = re.compile(r"[0-9]{1,20}\Z", re.ASCII)


def ensure_tables(conn):
    conn.execute("SELECT pg_advisory_xact_lock(739201, 7)")
    conn.execute('''CREATE TABLE IF NOT EXISTS registration_events (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL,
        channel TEXT NOT NULL,
        mode TEXT NOT NULL,
        consent_at BIGINT,
        client_id TEXT,
        delivery_state TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at BIGINT NOT NULL DEFAULT 0,
        submitted_at BIGINT,
        error_code TEXT
    )''')
    conn.execute('''CREATE INDEX IF NOT EXISTS registration_delivery_queue
                    ON registration_events(delivery_state, next_attempt_at)''')
    # Recover actual existing facts, at their original time, without inventing
    # consent, attribution or new conversions. Idempotent across worker starts.
    conn.execute('''INSERT INTO registration_events
        (user_id, created_at, channel, mode, delivery_state)
        SELECT id, created_at, 'unknown', 'historical', 'historical'
        FROM users WHERE COALESCE(is_seed, 0) = 0
          AND email NOT LIKE ? AND email != ?
        ON CONFLICT(user_id) DO NOTHING''', ('%@wiring.guest', 'demo@wiring.app'))


def valid_client_id(value):
    return isinstance(value, str) and CLIENT_ID.fullmatch(value) is not None


def attribution(cookies):
    cid = cookies.get('_ym_uid', '')
    consent = cookies.get('wiring-analytics-consent') == 'granted'
    return consent, cid if consent and valid_client_id(cid) else None


def record(conn, user_id, created_at, *, channel, managed=False, cookies=None):
    native = channel.startswith('native')
    consent, cid = attribution(cookies or {}) if not native else (False, None)
    mode = 'server' if managed else 'native' if native else 'legacy'
    state = ('pending' if cid else 'needs_attribution' if consent else 'no_consent') if managed else (
        'no_consent' if native else 'legacy_browser')
    conn.execute('''INSERT INTO registration_events
        (user_id, created_at, channel, mode, consent_at, client_id, delivery_state)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING''',
        (user_id, created_at, channel, mode, created_at if consent else None,
         cid if managed else None, state))


def receipt(secret, user_id):
    return URLSafeTimedSerializer(secret, salt='wiring-registration-v1').dumps(user_id)


def receipt_user(secret, token):
    if not isinstance(token, str) or len(token) > 512:
        return None
    try:
        uid = URLSafeTimedSerializer(secret, salt='wiring-registration-v1').loads(token, max_age=MAX_AGE)
        return uid if type(uid) is int and uid > 0 else None
    except BadSignature:
        return None


def attach(conn, uid, *, consent, client_id, now=None):
    now = int(time.time()) if now is None else now
    row = conn.execute('''SELECT * FROM registration_events WHERE user_id = ? FOR UPDATE''', (uid,)).fetchone()
    if not row or row['mode'] != 'server' or now - row['created_at'] > MAX_AGE:
        return False
    if row['delivery_state'] not in ('pending', 'needs_attribution', 'no_consent'):
        return True  # Idempotent replay never schedules a second delivery.
    if consent is not True:
        conn.execute('''UPDATE registration_events SET client_id = NULL, consent_at = NULL,
                        delivery_state = 'no_consent' WHERE user_id = ?''', (uid,))
    elif valid_client_id(client_id):
        conn.execute('''UPDATE registration_events SET client_id = ?, consent_at = ?,
                        delivery_state = 'pending' WHERE user_id = ?''', (client_id, now, uid))
    return True


@dataclass(frozen=True)
class Config:
    counter_id: str
    secret: str = field(repr=False)
    site_url: str = 'https://wiring.club'


def load_config():
    counter = os.environ.get('YANDEX_METRIKA_ID', '').strip()
    secret = os.environ.get('YANDEX_METRIKA_MEASUREMENT_SECRET', '').strip()
    if not secret or not re.fullmatch(r'[0-9]{5,15}', counter):
        return None
    return Config(counter, secret, os.environ.get('SITE_URL', 'https://wiring.club').rstrip('/'))


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Client:
    def __init__(self, config):
        self.config = config
        self.opener = build_opener(_NoRedirect())

    def send(self, row):
        # POST keeps the secret and attribution out of URL/access logs.
        body = urlencode(dict(tid=self.config.counter_id, ms=self.config.secret,
                              cid=row['client_id'], t='event', ea=GOAL,
                              et=row['created_at'], dl=self.config.site_url + '/sign-up')).encode()
        req = Request('https://mc.yandex.ru/collect', data=body,
                      headers={'Content-Type': 'application/x-www-form-urlencoded'})
        try:
            with self.opener.open(req, timeout=10) as response:
                return 'submitted' if response.status == 200 and response.read(256).strip() == b'<!-- OK -->' else 'unknown'
        except HTTPError as exc:
            # Explicit rejection may be retried only when rate-limited. Never
            # include provider bodies, URLs, ClientID or secrets in diagnostics.
            return 'retry' if exc.code == 429 else 'rejected' if 400 <= exc.code < 500 else 'unknown'
        except Exception:
            return 'unknown'  # The service may have accepted a timed-out request.


def sync(conn, client, *, now=None, limit=25):
    now = int(time.time()) if now is None else now
    result = dict(submitted=0, retry=0, rejected=0, unknown=0, expired=0)
    lock = conn.execute('SELECT pg_try_advisory_lock(739201, 8) AS locked').fetchone()['locked']
    conn.commit()
    if not lock:
        return {'busy': True}
    try:
        # An interrupted sender may have reached Yandex. Hold it for review.
        conn.execute("UPDATE registration_events SET delivery_state = 'unknown', error_code = 'interrupted' WHERE delivery_state = 'sending'")
        result['expired'] = conn.execute("UPDATE registration_events SET delivery_state = 'expired' WHERE delivery_state IN ('pending', 'needs_attribution') AND created_at < ?", (now - MAX_AGE,)).rowcount
        conn.commit()
        for _ in range(limit):
            row = conn.execute('''SELECT * FROM registration_events
                WHERE delivery_state = 'pending' AND consent_at IS NOT NULL
                  AND client_id IS NOT NULL AND next_attempt_at <= ?
                ORDER BY created_at, user_id LIMIT 1 FOR UPDATE SKIP LOCKED''', (now,)).fetchone()
            if not row:
                conn.rollback()
                break
            conn.execute("UPDATE registration_events SET delivery_state = 'sending', attempts = attempts + 1 WHERE user_id = ?", (row['user_id'],))
            conn.commit()  # Durable claim before the external side effect.
            outcome = client.send(row)
            state = 'pending' if outcome == 'retry' else outcome
            conn.execute('''UPDATE registration_events SET delivery_state = ?, submitted_at = ?,
                next_attempt_at = ?, error_code = ? WHERE user_id = ?''',
                (state, now if outcome == 'submitted' else None, now + 300,
                 None if outcome == 'submitted' else outcome, row['user_id']))
            conn.commit()
            result[outcome] += 1
        return result
    finally:
        conn.rollback()
        conn.execute('SELECT pg_advisory_unlock(739201, 8)')
        conn.commit()


def summary(conn):
    return [dict(row) for row in conn.execute('''SELECT delivery_state, count(*) AS total
              FROM registration_events GROUP BY delivery_state ORDER BY delivery_state''').fetchall()]
