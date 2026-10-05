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


class AppleIdentityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import json
        import jwt
        from cryptography.hazmat.primitives.asymmetric import rsa
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.jwk = {**json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(cls.key.public_key())), 'kid': 'test-key'}

    def token(self, **overrides):
        import time
        import jwt
        claims = dict(iss='https://appleid.apple.com', aud='apple-client', sub='apple-user',
                      iat=int(time.time()), exp=int(time.time()) + 300, nonce='nonce',
                      email='hidden@privaterelay.appleid.com', email_verified='true')
        return jwt.encode({**claims, **overrides}, self.key, algorithm='RS256', headers={'kid': 'test-key'})

    @patch.dict('os.environ', {'APPLE_CLIENT_ID': 'apple-client', 'APPLE_CLIENT_SECRET': 'test-secret'})
    def test_exchange_signed_identity_and_private_email(self):
        with patch('social_auth._json_request', side_effect=[{'id_token': self.token()}, {'keys': [self.jwk]}]) as call:
            self.assertEqual(exchange_identity('apple', 'code', 'callback', 'nonce'),
                             ('apple-user', 'hidden@privaterelay.appleid.com', 'Участник', False))
            data = call.call_args_list[0].kwargs['data']
            self.assertNotIn('code_verifier', data)
            self.assertEqual(data['client_secret'], 'test-secret')

    def test_reject_invalid_claims_and_signature(self):
        from social_auth import _apple_identity
        import time
        for change in ({'aud': 'other'}, {'iss': 'other'}, {'exp': int(time.time()) - 1},
                       {'nonce': 'other'}, {'email_verified': False}, {'nonce': None}):
            with self.subTest(change=change), patch('social_auth._json_request', return_value={'keys': [self.jwk]}):
                with self.assertRaises(OAuthError):
                    _apple_identity(self.token(**change), 'apple-client', 'nonce')
        from cryptography.hazmat.primitives.asymmetric import rsa
        import json
        import jwt
        wrong_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        jwk = {**json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(wrong_key.public_key())), 'kid': 'test-key'}
        with patch('social_auth._json_request', return_value={'keys': [jwk]}):
            with self.assertRaises(OAuthError):
                _apple_identity(self.token(), 'apple-client', 'nonce')
        for token in (None, '', 'not-a-token'):
            with self.assertRaises(OAuthError):
                _apple_identity(token, 'apple-client', 'nonce')
