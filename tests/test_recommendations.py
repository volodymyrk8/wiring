"""Selection tests do not call Jev or require accounts."""
import json
import unittest
from unittest.mock import patch

from recommendations import select_recommendations, SHORTLIST_SIZE
from jev_ranker import rank_profiles


class FakeConnection:
    def __init__(self, cards, likes=None, passes=None):
        self.cards = cards
        self.likes = likes or []
        self.passes = passes or []
        self.queries = []

    def execute(self, sql, params):
        self.queries.append(sql)
        if "swipes.direction" in sql:
            self.page = self.likes if params[-1] == "like" else self.passes
            return self
        self.page = [card for card in self.cards if card["id"] > params[0]][:params[-1]]
        return self

    def fetchall(self):
        return self.page


class RecommendationsTests(unittest.TestCase):
    def test_scans_beyond_first_batch_and_bounds_jev_shortlist(self):
        viewer = {"id": 1, "age": 28, "vibe": ["nonsmalltalk"], "intents": ["dating"]}
        cards = [{"id": i, "age": 45, "vibe": []} for i in range(2, 602)]
        cards[-1].update(age=28, vibe=["nonsmalltalk"], intents=["dating"])
        conn = FakeConnection(cards)
        with patch("recommendations.rank_profiles", return_value=None) as rank:
            result, source = select_recommendations(conn, viewer, lambda card: card)
        self.assertEqual(result[0]["id"], 601)
        self.assertEqual(len(result), SHORTLIST_SIZE)
        self.assertEqual(len(rank.call_args.args[1]), SHORTLIST_SIZE)
        self.assertEqual(source, "local")
        self.assertGreater(len(conn.queries), 2)
        self.assertTrue(all("INSERT" not in query and "UPDATE" not in query for query in conn.queries))
        self.assertTrue(all("jev_match_pct" not in card for card in result))

    def test_provider_order_and_source_preserved_but_no_percent(self):
        cards = [{"id": 2, "age": 28}, {"id": 3, "age": 28}]
        ranked = [{**cards[1], "jev_match_pct": 90}, {**cards[0], "jev_match_pct": 20}]
        with patch("recommendations.rank_profiles", return_value=ranked):
            result, source = select_recommendations(FakeConnection(cards), {"id": 1, "age": 28}, lambda row: row)
        self.assertEqual(source, "api")
        self.assertEqual([card["id"] for card in result], [3, 2])
        self.assertTrue(all("jev_match_pct" not in card for card in result))

    def test_provider_request_omits_identifying_and_free_text_data(self):
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, _):
                return json.dumps({"answers": {f"candidate_{i}": {"type": "noul", "noul": .6} for i in range(2)}}).encode()
        viewer = {"id": 8877, "name": "PRIVATE_NAME", "bio": "PRIVATE_BIO", "city": "PRIVATE_CITY", "age": 28, "neuro": ["asd"]}
        cards = [{"id": i, "name": "PRIVATE_NAME", "bio": "PRIVATE_BIO", "city": "PRIVATE_CITY", "photo": "PRIVATE_PHOTO", "age": 28} for i in (7788, 7789)]
        with patch.dict("os.environ", {"JEV_API_KEY": "test-key"}), patch("jev_ranker.urlopen", return_value=Response()) as request:
            self.assertIsNotNone(rank_profiles(viewer, cards))
        payload = request.call_args.args[0].data.decode()
        for private in ("8877", "7788", "7789", "PRIVATE_NAME", "PRIVATE_BIO", "PRIVATE_CITY", "PRIVATE_PHOTO"):
            self.assertNotIn(private, payload)

    def test_three_likes_rank_people_like_those_likes(self):
        viewer = {"id": 1, "age": 50, "vibe": ["quiet"], "intents": ["friends"], "neuro": [], "city": "Москва"}
        liked = {"id": 9, "age": 30, "vibe": ["nonsmalltalk"], "intents": ["dating"], "neuro": ["asd"], "city": "Батуми"}
        likes = [dict(liked, id=20 + index) for index in range(3)]
        far = {"id": 2, "age": 50, "vibe": ["quiet"], "intents": ["friends"], "neuro": [], "city": "Москва"}
        near = {"id": 3, "age": 31, "vibe": ["nonsmalltalk"], "intents": ["dating"], "neuro": ["asd"], "city": "Батуми"}
        with patch("recommendations.rank_profiles", return_value=None) as rank:
            result, source = select_recommendations(FakeConnection([far, near], likes=likes), viewer, lambda card: card)
        self.assertEqual(source, "taste")
        self.assertEqual(result[0]["id"], 3)
        rank.assert_not_called()
