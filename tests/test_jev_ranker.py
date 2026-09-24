import unittest

from jev_ranker import _pair_signals, local_match_probability, match_reasons, prepare_jev_feed


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


    def test_prepare_jev_feed_local_scores_single_card(self):
        viewer = {"id": 1, "age": 28, "city": "x", "neuro": ["asd"], "vibe": [], "intents": ["dating"]}
        cards = [{"id": 2, "age": 29, "city": "x", "neuro": ["asd"], "vibe": [], "intents": ["dating"]}]
        out, ranked, source = prepare_jev_feed(viewer, cards)
        self.assertEqual(source, "local")
        self.assertFalse(ranked)
        self.assertEqual(len(out), 1)
        self.assertIn("jev_match_pct", out[0])
        self.assertGreaterEqual(out[0]["jev_match_pct"], 35)

    def test_local_probability_increases_with_shared_neuro(self):
        viewer = {"id": 1, "age": 25, "neuro": ["asd", "adhd"], "vibe": [], "intents": []}
        weak = {"id": 2, "age": 40, "neuro": [], "vibe": [], "intents": []}
        strong = {"id": 3, "age": 26, "neuro": ["asd"], "vibe": [], "intents": []}
        self.assertGreater(local_match_probability(viewer, strong), local_match_probability(viewer, weak))


if __name__ == "__main__":
    unittest.main()
