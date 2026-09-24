import unittest

from jev_ranker import _pair_signals, match_reasons


class JevRankerTests(unittest.TestCase):
    def test_pair_signals_include_all_neuro(self):
        viewer = {"age": 28, "city": "Нови-Сад", "neuro": ["asd", "adhd"], "vibe": ["nonsmalltalk"], "intents": ["dating"]}
        candidate = {"age": 30, "city": "Нови-Сад", "neuro": ["asd", "anxiety"], "vibe": [], "intents": ["dating", "friends"]}
        signals = _pair_signals(viewer, candidate)
        self.assertEqual(signals["viewer_neuro"], ["asd", "adhd"])
        self.assertEqual(signals["candidate_neuro"], ["asd", "anxiety"])
        self.assertEqual(signals["shared_neuro"], ["asd"])
        self.assertTrue(signals["same_city"])
        self.assertIn("dating", signals["shared_intent_ids"])

    def test_match_reasons_shared_neuro_first(self):
        viewer = {"neuro": ["asd"], "vibe": [], "city": "", "age": 25, "intents": []}
        candidate = {"neuro": ["asd", "adhd"], "vibe": [], "city": "", "age": 26, "intents": []}
        reasons = match_reasons(viewer, candidate)
        self.assertTrue(any("диагноз" in line.lower() for line in reasons))
        self.assertTrue(any("РАС" in line for line in reasons))


if __name__ == "__main__":
    unittest.main()
