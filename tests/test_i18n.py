import ast
import json
from pathlib import Path
import re
import unittest

from i18n import tr, use_language, editorial_html, catalog_copy
import catalog
import legal_pages
from glossary import GLOSS, glossary_html

ROOT = Path(__file__).resolve().parents[1]

class TranslationTest(unittest.TestCase):
    def test_all_python_messages_have_english_and_keep_placeholders(self):
        dictionary = json.loads((ROOT / 'locales/en.json').read_text())
        for path in ROOT.glob('*.py'):
            if path.name == 'neuroweb.py': continue
            for node in ast.walk(ast.parse(path.read_text())):
                if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                        and node.func.id == 'tr' and node.args
                        and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str)):
                    key = re.sub(r'\s+', ' ', node.args[0].value).strip()
                    with self.subTest(path=path.name, key=key):
                        self.assertIn(key, dictionary)
        for source, translated in dictionary.items():
            with self.subTest(key=source):
                self.assertEqual(sorted(re.findall(r'\{\d+\}', source)), sorted(re.findall(r'\{\d+\}', translated)))
                self.assertFalse(re.search('[А-Яа-яЁё]', translated), translated)

    def test_interpolation_preserves_original_member_text(self):
        with use_language('en'):
            self.assertEqual(tr('Лайк: {0}', 'Поддержка {0}'), 'Like: Поддержка {0}')
            self.assertEqual(tr('Имя'), 'Name')
        with use_language('ru'):
            self.assertEqual(tr('Лайк: {0}', 'Alice'), 'Лайк: Alice')

    def test_local_chat_suggestions_use_selected_language(self):
        from icebreakers import _heuristic_openers
        with use_language('en'):
            lines = _heuristic_openers({})
            self.assertEqual(len(lines), 3)
            self.assertTrue(all(not re.search('[А-Яа-яЁё]', line) for line in lines))
        with use_language('ru'):
            self.assertTrue(any(re.search('[А-Яа-яЁё]', line) for line in _heuristic_openers({})))

    def test_static_legal_documents_and_glossary_are_fully_translated(self):
        with use_language('en'):
            for name, body in vars(legal_pages).items():
                if name.endswith('_HTML'):
                    with self.subTest(document=name):
                        self.assertFalse(re.search('[А-Яа-яЁё]', editorial_html(body)))
            self.assertFalse(re.search('[А-Яа-яЁё]', editorial_html(glossary_html())))

    def test_catalog_changes_display_copy_but_keeps_ids_and_places(self):
        source = {'neuro': catalog.NEURO, 'vibe': catalog.VIBE, 'genders': catalog.GENDERS,
                  'looking_for': catalog.LOOKING_FOR, 'intents': catalog.INTENTS,
                  'prompts': catalog.PROMPTS, 'report_reasons': catalog.REPORT_REASONS,
                  'glossary': GLOSS, 'places': [{'country': 'Сербия', 'cities': ['Белград']}]}
        with use_language('en'):
            result = catalog_copy(source)
        self.assertEqual(result['places'], source['places'])
        for field in ('neuro', 'vibe', 'genders', 'looking_for', 'intents', 'prompts', 'report_reasons'):
            self.assertEqual([item['id'] for item in result[field]], [item['id'] for item in source[field]])
            for item in result[field]:
                for key in ('label', 'hint'):
                    self.assertFalse(re.search('[А-Яа-яЁё]', item.get(key, '')), item)
