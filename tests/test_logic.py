import unittest
from unittest.mock import patch

from cities import normalize_city
from icebreakers import openers_for
from matchmaker import heuristic_like, _mutual_looking_ok
from profanity import has_profanity
from io import BytesIO

from PIL import Image

from media import MediaError, make_thumb
from moderation import blocked_labels, moderate_photo


class LogicTest(unittest.TestCase):
    def test_mutual_looking(self):
        self.assertTrue(_mutual_looking_ok("women", "man", "men", "woman"))
        self.assertFalse(_mutual_looking_ok("women", "man", "women", "woman"))
        self.assertFalse(_mutual_looking_ok("men", "woman", "men", "man"))
        self.assertTrue(_mutual_looking_ok("everyone", "man", "everyone", "man"))
        self.assertTrue(_mutual_looking_ok("women", "man", "everyone", "woman"))
        self.assertFalse(_mutual_looking_ok("women", "man", "everyone", "man"))
        self.assertTrue(_mutual_looking_ok("women", "man", "men", "hidden"))

    def test_cities(self):
        self.assertEqual(normalize_city("Pscov"), "Псков")
        self.assertEqual(normalize_city("Gomel'"), "Гомель")
        self.assertEqual(normalize_city("Budva"), "Будва")
        self.assertEqual(normalize_city("novi sad"), "Нови-Сад")
        self.assertEqual(normalize_city("Kyiv"), "Киев")

    def test_profanity(self):
        self.assertTrue(has_profanity("хуй"))
        self.assertTrue(has_profanity("ГОВНО"))
        self.assertFalse(has_profanity("Саратов и таблицы"))

    def test_nika_does_not_like_women(self):
        nika = {
            "id": 7,
            "looking_for": "men",
            "gender": "woman",
            "age": 24,
            "city": "Москва",
            "neuro": ["adhd"],
            "vibe": [],
            "intent": "dating",
        }
        ada = {
            "id": 99,
            "looking_for": "everyone",
            "gender": "woman",
            "age": 29,
            "city": "Нови-Сад",
            "neuro": ["asd"],
            "vibe": ["nonsmalltalk"],
            "intent": "dating",
        }
        self.assertFalse(heuristic_like(nika, ada))

    def test_overlap_can_like(self):
        seed = {
            "id": 3,
            "looking_for": "everyone",
            "gender": "woman",
            "age": 26,
            "city": "Вильнюс",
            "neuro": ["asd", "hsp"],
            "vibe": ["nonsmalltalk"],
            "intent": "relationship",
            "communication": "текст",
        }
        ada = {
            "id": 99,
            "looking_for": "everyone",
            "gender": "woman",
            "age": 29,
            "city": "Вильнюс",
            "neuro": ["asd"],
            "vibe": ["nonsmalltalk"],
            "intent": "dating",
            "communication": "сразу",
        }
        self.assertTrue(heuristic_like(seed, ada))

    def test_openers(self):
        lines = openers_for(
            {
                "job": "поле и плёнка",
                "prompts": [{"id": "sensory", "answer": "ветер ок"}],
                "communication": "текст медленный",
                "vibe": ["parallel"],
                "bio": "",
                "neuro": [],
            }
        )
        self.assertEqual(len(lines), 3)

    def test_openai_openers_fallback(self):
        with patch("icebreakers._openai_openers", return_value=None):
            lines = openers_for({"job": "мох", "bio": "", "prompts": [], "vibe": [], "neuro": []})
        self.assertEqual(len(lines), 3)

    def test_openai_openers_used(self):
        fake = ["про мох в био — где смотришь?", "таблицы вечером ок?", "без small talk — норм?"]
        with patch("icebreakers._openai_openers", return_value=fake):
            lines = openers_for({"job": "x", "bio": "", "prompts": [], "vibe": [], "neuro": []})
        self.assertEqual(lines, fake)

    def test_make_thumb_is_small(self):
        buf = BytesIO()
        Image.new("RGB", (800, 600), (20, 30, 40)).save(buf, format="JPEG")
        thumb = make_thumb(buf.getvalue())
        with Image.open(BytesIO(thumb)) as out:
            self.assertLessEqual(max(out.size), 192)
        self.assertLess(len(thumb), len(buf.getvalue()))

    def test_moderation_blocks_only_sexual(self):
        self.assertEqual(blocked_labels({"categories": {"sexual": True, "hate": True}}), ("sexual",))
        self.assertEqual(blocked_labels({"categories": {"sexual/minors": True}}), ("sexual/minors",))
        self.assertEqual(blocked_labels({"categories": {"violence": True, "hate": True}}), ())

    def test_moderation_outage_allows(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test"}):
            with patch("moderation._ask_openai", side_effect=TimeoutError):
                moderate_photo(b"not-checked-on-timeout")

    def test_moderation_rejects_flagged(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test"}):
            with patch("moderation._ask_openai", return_value={"categories": {"sexual": True}}):
                with self.assertRaises(MediaError):
                    moderate_photo(b"flagged")


if __name__ == "__main__":
    unittest.main()
