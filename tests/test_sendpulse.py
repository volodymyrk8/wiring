import json
import os
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

from sendpulse_sync import Client, Config, SendPulseError, load_config


class SendPulseTests(unittest.TestCase):
    def test_config_loads_file_even_when_database_url_is_set_and_env_wins(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '.env'
            path.write_text('SENDPULSE_API_KEY="test-key"\nSENDPULSE_ADDRESSBOOK_ID=123 # book\n')
            with patch.dict(os.environ, {'DATABASE_URL': 'unused'}, clear=True):
                self.assertEqual(load_config(path), Config('test-key', 123))
                self.assertNotIn('test-key', repr(load_config(path)))
                with patch.dict(os.environ, {'SENDPULSE_API_KEY': 'override'}):
                    self.assertEqual(load_config(path).api_key, 'override')
                with patch.dict(os.environ, {'SENDPULSE_ADDRESSBOOK_ID': 'invalid'}):
                    with self.assertRaises(SendPulseError):
                        load_config(path)
                path.write_text('')
                self.assertIsNone(load_config(path))

    def client(self, result):
        client = Client(Config('test-secret', 123))
        client.opener = Mock()
        response = Mock()
        response.__enter__ = Mock(return_value=BytesIO(json.dumps(result).encode()))
        response.__exit__ = Mock(return_value=False)
        client.opener.open.return_value = response
        return client

    def test_validation_is_read_only_and_add_payload_has_only_email_and_name(self):
        client = self.client([{'id': 123, 'status': 0, 'name': 'Book'}])
        self.assertEqual(client.validate()['name'], 'Book')
        req = client.opener.open.call_args.args[0]
        self.assertEqual(req.get_method(), 'GET')
        self.assertEqual(req.headers['Authorization'], 'Bearer test-secret')
        client = self.client({'result': True})
        client.add('person@example.com', 'Имя')
        req = client.opener.open.call_args.args[0]
        self.assertEqual(json.loads(req.data), {'emails': [{'email': 'person@example.com', 'variables': {'name': 'Имя'}}]})
        self.assertEqual(client.opener.open.call_args.kwargs['timeout'], 10)

    def test_all_existing_contact_statuses_are_preserved(self):
        for status in (0, 1, 2, 3, 4, 13):
            client = self.client({'email': 'person@example.com', 'status': status})
            self.assertTrue(client.exists('person@example.com'))

    def test_missing_contact_codes_and_http_status(self):
        for code in (17, 303, 502):
            self.assertFalse(self.client({'error_code': code}).exists('new@example.com'))
        client = self.client(None)
        client.opener.open.side_effect = HTTPError('unused', 400, 'unused', {}, BytesIO(b'{"error_code":502}'))
        self.assertFalse(client.exists('new@example.com'))
        client.opener.open.side_effect = HTTPError('unused', 404, 'unused', {}, BytesIO(b'{}'))
        self.assertFalse(client.exists('new@example.com'))

    def test_errors_are_safe_and_not_mistaken_for_missing_contacts(self):
        for failure in (URLError('test-secret'), HTTPError('unused', 401, 'test-secret', {}, BytesIO(b'test-secret'))):
            client = self.client(None)
            client.opener.open.side_effect = failure
            with self.assertRaises(SendPulseError) as error:
                client.exists('person@example.com')
            self.assertNotIn('test-secret', str(error.exception))
        for result in ({'error_code': 213}, {'result': False}, [], {'id': 999, 'status': 0}):
            with self.assertRaises(SendPulseError):
                self.client(result).validate()
        with self.assertRaises(SendPulseError):
            self.client({'result': False}).add('person@example.com', 'Name')
