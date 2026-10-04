"""Server-side OAuth code flow; provider tokens never enter browser storage."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import secrets
import time
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import jsonify, redirect, request, session
from database import IntegrityError

PROVIDERS = {
    'google': ('https://accounts.google.com/o/oauth2/v2/auth', 'https://oauth2.googleapis.com/token',
               'https://openidconnect.googleapis.com/v1/userinfo', 'openid email profile'),
    'yandex': ('https://oauth.yandex.ru/authorize', 'https://oauth.yandex.ru/token',
               'https://login.yandex.ru/info?format=json', 'login:email login:info'),
}
TTL = 600


class OAuthError(Exception):
    pass


def credentials(provider):
    key = provider.upper()
    return (os.environ.get(f'{key}_CLIENT_ID', '').strip(), os.environ.get(f'{key}_CLIENT_SECRET', '').strip())


def ensure_tables(conn):
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS oauth_identities (
            provider TEXT NOT NULL, subject TEXT NOT NULL,
            user_id BIGINT NOT NULL REFERENCES users(id),
            PRIMARY KEY(provider, subject), UNIQUE(user_id, provider)
        );
        CREATE TABLE IF NOT EXISTS oauth_flows (
            state_hash TEXT PRIMARY KEY, browser TEXT NOT NULL, provider TEXT NOT NULL,
            verifier TEXT NOT NULL, mode TEXT NOT NULL, referral TEXT NOT NULL,
            redirect_uri TEXT NOT NULL, created_at BIGINT NOT NULL
        );
    ''')


def _json_request(url, *, data=None, headers=None):
    req = Request(url, data=urlencode(data).encode() if data else None, headers=headers or {})
    try:
        with urlopen(req, timeout=8) as response:
            payload = json.loads(response.read(65536))
        if not isinstance(payload, dict) or payload.get('error'):
            raise OAuthError('Не удалось войти. Попробуй ещё раз.')
        return payload
    except (URLError, TimeoutError, ValueError, OSError) as exc:
        raise OAuthError('Сервис входа временно недоступен. Попробуй ещё раз.') from exc


def exchange_identity(provider, code, redirect_uri, verifier):
    client_id, client_secret = credentials(provider)
    _, token_url, info_url, _ = PROVIDERS[provider]
    data = dict(grant_type='authorization_code', code=code, client_id=client_id,
                client_secret=client_secret, redirect_uri=redirect_uri)
    data['code_verifier'] = verifier
    token = _json_request(token_url, data=data).get('access_token')
    if not isinstance(token, str) or not token:
        raise OAuthError('Не удалось войти. Попробуй ещё раз.')
    info = _json_request(info_url, headers={'Authorization': f'{"Bearer" if provider == "google" else "OAuth"} {token}'})
    email = str(info.get('email' if provider == 'google' else 'default_email') or '').strip().lower()
    subject = str(info.get('sub' if provider == 'google' else 'id') or '').strip()
    if not subject or len(subject) > 255 or not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        raise OAuthError('Сервис входа не передал адрес почты. Разреши доступ к почте и повтори вход.')
    if email.endswith(('@wiring.guest', '@wiring.demo', '@deleted.wiring')) or email == 'demo@wiring.app':
        raise OAuthError('Этот адрес нельзя использовать для входа.')
    if provider == 'google' and info.get('email_verified') is not True:
        raise OAuthError('Сначала подтверди почту в аккаунте Google.')
    if provider == 'yandex' and info.get('client_id') != client_id:
        raise OAuthError('Не удалось проверить аккаунт Яндекса.')
    # Third-party addresses in Google accounts aren't authoritative for linking.
    authoritative = (email.endswith('@gmail.com') or bool(info.get('hd'))) if provider == 'google' else email.rsplit('@', 1)[1] in {
        'yandex.ru', 'yandex.com', 'ya.ru', 'yandex.by', 'yandex.kz', 'yandex.ua', 'yandex.com.tr'}
    name = str(info.get('given_name' if provider == 'google' else 'first_name') or info.get('display_name') or 'Участник').strip()[:32]
    return subject, email, name if len(name) >= 2 else 'Участник', authoritative


def install(app, *, db, prefix, site_url, create_user, too_many, grace):
    def failure(message, mode='login'):
        session['oauth_error'] = message
        return redirect(prefix('/register' if mode == 'register' else '/login'))

    @app.after_request
    def protect_oauth_response(response):
        endpoint = (request.endpoint or '').removesuffix('__prefixed')
        if endpoint in {'auth_providers', 'auth_start', 'auth_callback'}:
            response.headers['Cache-Control'] = 'no-store'
            response.headers['Referrer-Policy'] = 'no-referrer'
        return response

    @app.get('/api/auth/providers')
    def auth_providers():
        error = session.pop('oauth_error', '')
        response = jsonify(ok=True, providers=[p for p in PROVIDERS if all(credentials(p))], error_message=error)
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.post('/api/auth/<provider>/start')
    def auth_start(provider):
        if provider not in PROVIDERS or not all(credentials(provider)):
            return jsonify(ok=False, error='Этот способ входа пока не настроен.'), 503
        if request.headers.get('Origin') and request.headers['Origin'].rstrip('/') != request.host_url.rstrip('/'):
            return jsonify(ok=False, error='Открой вход на сайте WIRING.'), 403
        if too_many(f'oauth:{request.remote_addr}', 20, 300):
            return jsonify(ok=False, error='Слишком много попыток. Подожди.'), 429
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            return jsonify(ok=False, error='Некорректный запрос.'), 400
        mode = data.get('mode')
        if mode not in ('login', 'register'):
            return jsonify(ok=False, error='Выбери вход или регистрацию.'), 400
        if mode == 'register' and (data.get('age_confirm') is not True or data.get('privacy_confirm') is not True):
            return jsonify(ok=False, error='Подтверди возраст 18+ и согласие с правилами.'), 400
        # Keep the browser cookie on its starting host, but only for explicitly trusted origins.
        allowed_origins = {value.strip().rstrip('/') for value in
                           os.environ.get('OAUTH_ALLOWED_ORIGINS', site_url).split(',') if value.strip()}
        origin = request.host_url.rstrip('/')
        callback_origin = origin if origin in allowed_origins else site_url.rstrip('/')
        callback = callback_origin + prefix(f'/api/auth/{provider}/callback')
        state, browser, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(32), secrets.token_urlsafe(48)
        conn = db()
        conn.execute('DELETE FROM oauth_flows WHERE created_at < ?', (int(time.time()) - TTL,))
        conn.execute('INSERT INTO oauth_flows VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                     (hashlib.sha256(state.encode()).hexdigest(), browser, provider, verifier, mode,
                      str(data.get('ref') or '')[:100], callback, int(time.time())))
        conn.commit()
        session['oauth_browser'] = browser
        auth_url, _, _, scope = PROVIDERS[provider]
        params = dict(response_type='code', client_id=credentials(provider)[0], redirect_uri=callback, state=state, scope=scope)
        params.update(code_challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode(),
                          code_challenge_method='S256')
        if provider == 'google':
            params['prompt'] = 'select_account'
        return jsonify(ok=True, url=auth_url + '?' + urlencode(params))

    @app.get('/api/auth/<provider>/callback')
    def auth_callback(provider):
        if provider not in PROVIDERS or not all(credentials(provider)):
            return failure('Этот способ входа пока не настроен.')
        state = request.args.get('state', '')
        conn = db()
        flow = conn.execute('SELECT * FROM oauth_flows WHERE state_hash = ? FOR UPDATE',
                            (hashlib.sha256(state.encode()).hexdigest(),)).fetchone()
        browser = session.get('oauth_browser', '')
        if not flow or flow['provider'] != provider or not browser or not secrets.compare_digest(browser, flow['browser']):
            conn.rollback()
            return failure('Вход устарел. Начни заново.')
        conn.execute('DELETE FROM oauth_flows WHERE state_hash = ?', (flow['state_hash'],))
        conn.commit()  # Consume once before talking to the provider, including failed/cancelled flows.
        session.pop('oauth_browser', None)
        mode = flow['mode']
        if int(time.time()) - flow['created_at'] > TTL:
            return failure('Вход устарел. Начни заново.', mode)
        if request.args.get('error') or not request.args.get('code'):
            return failure('Вход отменён. Можно попробовать снова.', mode)
        try:
            subject, email, name, authoritative = exchange_identity(provider, request.args['code'], flow['redirect_uri'], flow['verifier'])
            # Serialize registration/linking by email; constraints also guard provider identity races.
            conn.execute('SELECT pg_advisory_xact_lock(hashtext(?))', (email,))
            row = conn.execute('SELECT u.* FROM users u JOIN oauth_identities i ON i.user_id = u.id WHERE i.provider = ? AND i.subject = ? FOR UPDATE OF u', (provider, subject)).fetchone()
            if not row:
                row = conn.execute('SELECT * FROM users WHERE email = ? FOR UPDATE', (email,)).fetchone()
                if row and (not authoritative or not row['email_verified_at'] or row['is_seed']):
                    raise OAuthError('Эта почта уже зарегистрирована. Войди с паролем или восстанови его через «Забыли пароль».')
                if not row:
                    if mode != 'register':
                        raise OAuthError('Аккаунта ещё нет. Открой «Создать профиль» и зарегистрируйся через этот сервис.')
                    uid = create_user(conn, email, name, flow['referral'])
                    row = conn.execute('SELECT * FROM users WHERE id = ?', (uid,)).fetchone()
                conn.execute('INSERT INTO oauth_identities (provider, subject, user_id) VALUES (?, ?, ?)', (provider, subject, row['id']))
            deleted = int(row['deleted_at'] or 0)
            if deleted and int(time.time()) - deleted > grace:
                raise OAuthError('Аккаунт удалён, срок восстановления прошёл.')
            conn.execute('UPDATE users SET deleted_at = NULL, last_seen = ? WHERE id = ?', (int(time.time()), row['id']))
            conn.commit()
        except (OAuthError, IntegrityError) as exc:
            conn.rollback()
            return failure(str(exc) if isinstance(exc, OAuthError) else 'Этот аккаунт уже связан с другим входом. Используй прежний способ входа.', mode)
        session.clear()
        session.permanent = True
        session['uid'] = row['id']
        return redirect(prefix('/me' if not row['onboard_done'] else '/feed'))
