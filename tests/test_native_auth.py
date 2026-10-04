"""Native auth uses the same account lifecycle with a one-time PKCE handoff."""
import base64
import hashlib
import os
import time
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import tests.test_app as base
from tests.test_app import app
from database import open_request_connection


class NativeAuthTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base.WiringTest.setUpClass()

    def setUp(self):
        base.WiringTest.setUp(self)
        self.mobile = app.test_client(use_cookies=False)
        self.browser = app.test_client()
        self.env = patch.dict(os.environ, {'GOOGLE_CLIENT_ID': 'test-client', 'GOOGLE_CLIENT_SECRET': 'test-secret'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.verifier = 'v' * 64
        self.challenge = base64.urlsafe_b64encode(hashlib.sha256(self.verifier.encode()).digest()).rstrip(b'=').decode()
        self.state = 'native-state-123456789'

    def start(self, **extra):
        return self.mobile.post('/api/auth/google/start', json=dict(mode='register', age_confirm=True,
            privacy_confirm=True, native=True, code_challenge=self.challenge, native_state=self.state, **extra))

    def code(self):
        start = self.start()
        self.assertEqual(start.status_code, 200, start.get_data(as_text=True))
        self.assertNotIn('Set-Cookie', start.headers)
        launch = urlparse(start.get_json()['url'])
        opened = self.browser.get(launch.path + '?' + launch.query)
        self.assertEqual(opened.status_code, 302)
        query = parse_qs(urlparse(opened.location).query)
        with patch('social_auth.exchange_identity', return_value=('subject', 'native@gmail.com', 'Ада', True)):
            callback = self.browser.get('/api/auth/google/callback', query_string=dict(state=query['state'][0], code='provider-code'))
        self.assertEqual(callback.status_code, 302, callback.get_data(as_text=True))
        result = urlparse(callback.location)
        self.assertEqual((result.scheme, result.netloc), ('wiring', 'oauth'))
        data = parse_qs(result.query)
        self.assertEqual(data['state'], [self.state])
        self.assertNotIn('access_token', data)
        self.assertNotIn('refresh_token', data)
        return data['code'][0]

    def exchange(self, code, verifier=None):
        return self.mobile.post('/api/auth/native/exchange', json=dict(code=code, code_verifier=verifier or self.verifier))

    def test_native_pkce_returns_cookie_free_session_and_consumes_code(self):
        code = self.code()
        invalid = self.exchange(code, 'wrong' * 13)
        self.assertEqual(invalid.status_code, 400)
        result = self.exchange(code)
        self.assertEqual(result.status_code, 200, result.get_data(as_text=True))
        self.assertNotIn('Set-Cookie', result.headers)
        self.assertEqual(result.headers['Cache-Control'], 'no-store')
        tokens = result.get_json()
        self.assertEqual(tokens['user']['email'], 'native@gmail.com')
        profile = self.mobile.get('/api/me', headers={'Authorization': 'Bearer ' + tokens['access_token']})
        self.assertEqual(profile.get_json()['user']['id'], tokens['user']['id'])
        self.assertEqual(self.exchange(code).status_code, 400)

    def test_expired_code_and_arbitrary_callback_are_rejected(self):
        code = self.code()
        conn = open_request_connection()
        conn.execute('UPDATE oauth_native_codes SET created_at = ?', (int(time.time()) - 61,))
        conn.commit()
        conn.close()
        self.assertEqual(self.exchange(code).status_code, 400)
        result = self.mobile.post('/api/auth/google/start', json=dict(mode='login', native=True, code_challenge='bad', native_state='bad', redirect_uri='evil://callback'))
        self.assertEqual(result.status_code, 400)

    def test_browser_ticket_and_registration_consents_are_required(self):
        start = self.start()
        url = urlparse(start.get_json()['url'])
        query = parse_qs(url.query)
        bad = self.browser.get(url.path, query_string=dict(state=query['state'][0], ticket='wrong'))
        self.assertEqual(bad.status_code, 400)
        result = self.mobile.post('/api/auth/google/start', json=dict(mode='register', native=True, code_challenge=self.challenge, native_state=self.state))
        self.assertEqual(result.status_code, 400)

    def test_provider_cancellation_returns_to_native_with_state(self):
        start = self.start()
        url = urlparse(start.get_json()['url'])
        opened = self.browser.get(url.path + '?' + url.query)
        state = parse_qs(urlparse(opened.location).query)['state'][0]
        result = self.browser.get('/api/auth/google/callback', query_string=dict(state=state, error='access_denied'))
        query = parse_qs(urlparse(result.location).query)
        self.assertEqual(query['state'], [self.state])
        self.assertIn('error', query)

    def test_email_verification_issues_native_tokens_once(self):
        # Registration's normal verification proof, no production mail/account access.
        with patch('app.email_verify_enforced', return_value=True), patch('app.send_mail'):
            result = self.mobile.post('/api/register', json=dict(name='Ада', email='verify-native@example.com', password='secret1', age_confirm=True, privacy_confirm=True))
        self.assertEqual(result.status_code, 200, result.get_data(as_text=True))
        conn = open_request_connection()
        proof = conn.execute('SELECT token FROM email_verifications ORDER BY created_at DESC LIMIT 1').fetchone()
        conn.close()
        self.assertIsNotNone(proof)
        verified = self.mobile.post('/api/email/verify', json=dict(token=proof['token'], mobile=True))
        self.assertEqual(verified.status_code, 200, verified.get_data(as_text=True))
        self.assertIn('access_token', verified.get_json())
        self.assertNotIn('Set-Cookie', verified.headers)
        self.assertEqual(self.mobile.post('/api/email/verify', json=dict(token=proof['token'], mobile=True)).status_code, 400)

    def test_app_links_use_known_app_identity_and_configured_release_fingerprints(self):
        apple = self.mobile.get('/.well-known/apple-app-site-association')
        self.assertEqual(apple.status_code, 200)
        detail = apple.get_json()['applinks']['details'][0]
        self.assertEqual(detail['appIDs'], ['G3T7684N3M.date.wiring.app'])
        self.assertIn({'/': '/api/*', 'exclude': True}, detail['components'])
        with patch.dict(os.environ, {'ANDROID_APP_LINK_SHA256': ''}):
            self.assertEqual(self.mobile.get('/.well-known/assetlinks.json').get_json(), [])
        fingerprint = ':'.join(['AA'] * 32)
        with patch.dict(os.environ, {'ANDROID_APP_LINK_SHA256': fingerprint + ',invalid'}):
            android = self.mobile.get('/.well-known/assetlinks.json').get_json()[0]['target']
        self.assertEqual(android['package_name'], 'date.wiring.app')
        self.assertEqual(android['sha256_cert_fingerprints'], [fingerprint])

    def test_support_accepts_native_bearer_without_cookie(self):
        code = self.code()
        tokens = self.exchange(code).get_json()
        with patch('app.notify_support'):
            result = self.mobile.post('/support', json=dict(body='Помогите с моей анкетой'),
                headers={'Authorization': 'Bearer ' + tokens['access_token']})
        self.assertEqual(result.status_code, 200)
        self.assertNotIn('Set-Cookie', result.headers)
        conn = open_request_connection()
        ticket = conn.execute('SELECT user_id FROM support_tickets ORDER BY id DESC LIMIT 1').fetchone()
        conn.close()
        self.assertEqual(ticket['user_id'], tokens['user']['id'])
