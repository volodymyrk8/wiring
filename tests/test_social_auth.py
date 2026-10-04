import unittest
from unittest.mock import patch

from social_auth import exchange_identity, OAuthError


class ProviderIdentityTest(unittest.TestCase):
    @patch.dict('os.environ', {'GOOGLE_CLIENT_ID': 'client', 'GOOGLE_CLIENT_SECRET': 'secret'})
    def test_google_exchange_pkce_and_unverified_email(self):
        info = dict(sub='123', email='owner@gmail.com', email_verified=True, given_name='Ада')
        with patch('social_auth._json_request', side_effect=[{'access_token': 'token'}, info]) as call:
            identity = exchange_identity('google', 'code', 'https://test/callback', 'verifier')
            self.assertTrue(identity[3])
            self.assertEqual(call.call_args_list[0].kwargs['data']['code_verifier'], 'verifier')
            self.assertEqual(call.call_args_list[1].kwargs['headers']['Authorization'], 'Bearer token')
        for verified in (False, 'true', None):
            with patch('social_auth._json_request', side_effect=[{'access_token': 'token'}, {**info, 'email_verified': verified}]):
                with self.assertRaises(OAuthError):
                    exchange_identity('google', 'code', 'callback', 'verifier')
        with patch('social_auth._json_request', side_effect=[{'access_token': 'token'}, {**info, 'email': 'owner@external.test'}]):
            self.assertFalse(exchange_identity('google', 'code', 'callback', 'verifier')[3])

    @patch.dict('os.environ', {'YANDEX_CLIENT_ID': 'client', 'YANDEX_CLIENT_SECRET': 'secret'})
    def test_yandex_email_client_and_pkce(self):
        info = dict(id='321', client_id='client', default_email='owner@yandex.ru', first_name='Ада')
        with patch('social_auth._json_request', side_effect=[{'access_token': 'token'}, info]) as call:
            self.assertTrue(exchange_identity('yandex', 'code', 'callback', 'verifier')[3])
            self.assertEqual(call.call_args_list[0].kwargs['data']['code_verifier'], 'verifier')
            self.assertEqual(call.call_args_list[1].kwargs['headers']['Authorization'], 'OAuth token')
        for invalid in ({**info, 'client_id': 'other'}, {**info, 'default_email': ''}, {**info, 'id': ''}):
            with patch('social_auth._json_request', side_effect=[{'access_token': 'token'}, invalid]):
                with self.assertRaises(OAuthError):
                    exchange_identity('yandex', 'code', 'callback', 'verifier')
