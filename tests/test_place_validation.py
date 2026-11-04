import json
import unittest
from unittest.mock import MagicMock, patch

from place_validation import CityError, _ask_openai


class CityProviderTests(unittest.TestCase):
    def test_world_suggestions_preserve_existing_city_identifiers(self):
        from cities import catalog_city, country_of_city
        for value, expected in [('Belgrade · Сербия', 'Белград'), ('Moscow · Россия', 'Москва'), ('London · Канада', 'London · Канада')]:
            self.assertEqual(catalog_city(value), expected)
        for query in ['сан паулу', 'Sao Paulo', 'São Paulo']:
            self.assertEqual(catalog_city(query), 'São Paulo · Бразилия')
            self.assertEqual(country_of_city(query), 'Бразилия')

    def test_strict_schema_and_minimal_payload(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({
            'choices': [{'message': {'content': json.dumps({'valid': True, 'city': 'São Paulo', 'country_code': 'BR'})}}],
        }).encode()
        with patch.dict('os.environ', {'OPENAI_API_KEY': 'local-test-key', 'OPENAI_CITY_MODEL': 'gpt-4o-mini'}), patch('place_validation.urllib.request.urlopen', return_value=response) as send:
            self.assertEqual(_ask_openai('Sao Paollo', 'Бразилия')['city'], 'São Paulo')
        request = send.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(request.full_url, 'https://api.openai.com/v1/chat/completions')
        self.assertEqual(send.call_args.kwargs['timeout'], 10)
        self.assertEqual(json.loads(payload['messages'][1]['content']), {'city': 'Sao Paollo', 'country': 'Бразилия'})
        schema = payload['response_format']['json_schema']
        self.assertIs(schema['strict'], True)
        self.assertIs(schema['schema']['additionalProperties'], False)
        self.assertEqual(set(schema['schema']['required']), {'valid', 'city', 'country_code'})

    def test_refusal_truncation_and_network_failure_are_unavailable(self):
        for body in [{}, {'choices': []}, {'choices': [{'message': {'content': None, 'refusal': 'no'}}]}, {'choices': [{'message': {'content': '{'}}]}]:
            response = MagicMock()
            response.__enter__.return_value.read.return_value = json.dumps(body).encode()
            with self.subTest(body=body), patch.dict('os.environ', {'OPENAI_API_KEY': 'local-test-key'}), patch('place_validation.urllib.request.urlopen', return_value=response):
                with self.assertRaises(CityError) as error:
                    _ask_openai('input', '')
                self.assertEqual(error.exception.status, 503)
        with patch.dict('os.environ', {'OPENAI_API_KEY': 'local-test-key'}), patch('place_validation.urllib.request.urlopen', side_effect=TimeoutError('timeout')):
            with self.assertRaises(CityError) as error:
                _ask_openai('input', '')
            self.assertEqual(error.exception.status, 503)
