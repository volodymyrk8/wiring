import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

from tests import test_app as fixtures
app = fixtures.app
from database import open_request_connection
import registration_events as events


class RegistrationEventTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.WiringTest.setUpClass()

    def setUp(self):
        fixtures.WiringTest.setUp(self)
        self.config = patch.dict('os.environ', {'YANDEX_METRIKA_ID': '112672745',
                                               'YANDEX_METRIKA_MEASUREMENT_SECRET': 'local-secret'})
        self.config.start()
        self.addCleanup(self.config.stop)

    def register(self, email='signup@wiring.test', *, headers=None):
        return self.client.post('/api/register', headers=headers or {}, json=dict(
            name='Local signup', email=email, password='secret1', age_confirm=True, privacy_confirm=True))

    def rows(self):
        conn = open_request_connection()
        try:
            return [dict(row) for row in conn.execute('SELECT * FROM registration_events ORDER BY user_id').fetchall()]
        finally:
            conn.close()

    def grant(self):
        self.client.set_cookie('wiring-analytics-consent', 'granted')
        self.client.set_cookie('_ym_uid', '1710232430899999999')

    def test_every_signup_is_atomic_and_native_does_not_borrow_browser_consent(self):
        self.grant()
        self.assertEqual(self.register(headers={'X-Wiring-Registration-Tracking': 'server-v1'}).status_code, 200)
        self.assertEqual(self.register('native@wiring.test', headers={'X-App-Platform': 'ios'}).status_code, 200)
        self.assertEqual(self.register('old-web@wiring.test').status_code, 200)
        self.assertEqual(self.register().status_code, 409)
        rows = self.rows()
        self.assertEqual(len(rows), 3)
        self.assertEqual([r['delivery_state'] for r in rows], ['pending', 'no_consent', 'legacy_browser'])
        self.assertIsNone(rows[1]['client_id'])
        with patch('registration_events.record', side_effect=RuntimeError('local rollback fixture')):
            with self.assertRaises(RuntimeError):
                self.register('rollback@wiring.test')
        conn = open_request_connection()
        try:
            self.assertIsNone(conn.execute('SELECT id FROM users WHERE email = ?', ('rollback@wiring.test',)).fetchone())
        finally:
            conn.close()

    def test_signed_receipt_late_consent_idempotency_and_revocation(self):
        response = self.register(headers={'X-Wiring-Registration-Tracking': 'server-v1'})
        result = response.get_json()
        self.assertEqual(result['registration_tracking'], 'server')
        self.assertNotIn('registration_receipt', result)
        self.assertTrue(any('HttpOnly' in h and 'wiring-registration-receipt' in h for h in response.headers.getlist('Set-Cookie')))
        token = self.client.get_cookie('wiring-registration-receipt', path='/api/analytics').value
        self.assertEqual(self.rows()[0]['delivery_state'], 'no_consent')

        for _ in range(2):
            response = self.client.post('/api/analytics/registration', json=dict(
                consent=True, client_id='1710232430899999999'))
            self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.rows()), 1)
        self.assertEqual(self.rows()[0]['delivery_state'], 'pending')
        self.client.set_cookie('wiring-registration-receipt', token+'x', path='/api/analytics')
        self.assertEqual(self.client.post('/api/analytics/registration', json=dict(
            consent=True, client_id='1710232430899999999')).status_code, 400)
        self.client.set_cookie('wiring-registration-receipt', token, path='/api/analytics')
        self.client.post('/api/analytics/registration', json=dict(consent=False))
        self.assertIsNone(self.rows()[0]['client_id'])
        self.assertEqual(self.rows()[0]['delivery_state'], 'no_consent')

    def test_missing_server_credentials_preserve_browser_goal_without_later_double_export(self):
        self.grant()
        with patch.dict('os.environ', {'YANDEX_METRIKA_MEASUREMENT_SECRET': ''}):
            result = self.register(headers={'X-Wiring-Registration-Tracking': 'server-v1'}).get_json()
        self.assertNotIn('registration_receipt', result)
        self.assertEqual(self.rows()[0]['delivery_state'], 'legacy_browser')
        conn = open_request_connection()
        try:
            client = Mock()
            events.sync(conn, client)
            client.send.assert_not_called()
        finally:
            conn.close()

    def test_oauth_new_account_and_existing_login_share_one_fact(self):
        self.grant()
        env = {'GOOGLE_CLIENT_ID': 'local-client', 'GOOGLE_CLIENT_SECRET': 'local-secret'}
        with patch.dict('os.environ', env):
            for attempt in range(2):
                start = self.client.post('/api/auth/google/start', headers={'X-Wiring-Registration-Tracking': 'server-v1'},
                                         json=dict(mode='register', age_confirm=True, privacy_confirm=True)).get_json()
                state = parse_qs(urlsplit(start['url']).query)['state'][0]
                with patch('social_auth.exchange_identity', return_value=('subject', 'local@gmail.com', 'Local', True)):
                    response = self.client.get('/api/auth/google/callback', query_string=dict(state=state, code='local-code'))
                self.assertEqual(response.status_code, 302)
                if attempt == 0:
                    shell = self.client.get('/feed')
                    token = self.client.get_cookie('wiring-registration-receipt', path='/api/analytics').value
                    self.assertIn('data-registration-managed="true"', shell.get_data(as_text=True))
                    self.assertNotIn(token, shell.get_data(as_text=True))
        self.assertEqual(len(self.rows()), 1)
        self.assertEqual(self.rows()[0]['channel'], 'web_oauth_google')
        self.assertEqual(self.rows()[0]['delivery_state'], 'pending')

    def test_history_is_not_exported_and_original_time_is_preserved(self):
        self.register()
        original = self.rows()[0]['created_at']
        conn = open_request_connection()
        try:
            conn.execute('DELETE FROM registration_events')
            events.ensure_tables(conn)
            conn.commit()
            client = Mock()
            events.sync(conn, client)
            client.send.assert_not_called()
            row = conn.execute('SELECT * FROM registration_events').fetchone()
            self.assertEqual((row['mode'], row['created_at']), ('historical', original))
        finally:
            conn.close()

    def test_sender_does_not_repeat_submitted_or_ambiguous_events(self):
        self.grant()
        for i in range(3):
            self.register(f'queued-{i}@wiring.test', headers={'X-Wiring-Registration-Tracking': 'server-v1'})
        conn = open_request_connection()
        client = Mock()
        client.send.side_effect = ['submitted', 'unknown', 'retry', 'submitted']
        try:
            now = self.rows()[0]['created_at']
            result = events.sync(conn, client, now=now)
            self.assertEqual((result['submitted'], result['unknown'], result['retry']), (1, 1, 1))
            events.sync(conn, client, now=now+301)
            self.assertEqual(client.send.call_count, 4)
            events.sync(conn, client, now=now+602)
            self.assertEqual(client.send.call_count, 4)
            self.assertEqual([r['delivery_state'] for r in self.rows()], ['submitted', 'unknown', 'submitted'])
            token = events.receipt(app.secret_key, self.rows()[0]['user_id'])
            self.client.set_cookie('wiring-registration-receipt', token, path='/api/analytics')
            self.client.post('/api/analytics/registration', json=dict(consent=True, client_id='1'))
            events.sync(conn, client, now=now+603)
            self.assertEqual(client.send.call_count, 4)
        finally:
            conn.close()

    def test_measurement_protocol_uses_only_documented_nonpersonal_fields(self):
        client = events.Client(events.Config('112672745', 'local-secret'))
        response = Mock(status=200)
        response.read.return_value = b'<!-- OK -->'
        client.opener = Mock()
        client.opener.open.return_value.__enter__ = Mock(return_value=response)
        client.opener.open.return_value.__exit__ = Mock(return_value=False)
        self.assertEqual(client.send({'client_id': '1710232430899999999', 'created_at': 1793475000}), 'submitted')
        req = client.opener.open.call_args.args[0]
        self.assertEqual(req.full_url, 'https://mc.yandex.ru/collect')
        body = parse_qs(req.data.decode())
        self.assertEqual(set(body), {'tid', 'ms', 'cid', 't', 'ea', 'et', 'dl'})
        self.assertEqual(body['ea'], ['registration_success'])
        self.assertNotIn('local-secret', repr(client.config))
