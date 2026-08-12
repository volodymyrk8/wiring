import os
import tempfile
import unittest

os.environ.setdefault("DATING_DB", os.path.join(tempfile.gettempdir(), "wiring-test.sqlite3"))
os.environ.setdefault("APP_SECRET_KEY", "test-secret")
os.environ["DATING_DB"] = os.path.join(tempfile.gettempdir(), f"wiring-test-{os.getpid()}.sqlite3")

from app import app, init_db, DB_PATH  # noqa: E402


class WiringTest(unittest.TestCase):
    def setUp(self):
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)
        init_db()
        app.config["TESTING"] = True
        self.client = app.test_client()

    def tearDown(self):
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)

    def test_health_and_catalog(self):
        health = self.client.get("/health").get_json()
        self.assertTrue(health["ok"])
        self.assertGreaterEqual(health["users"], 8)
        catalog = self.client.get("/api/catalog").get_json()
        self.assertTrue(any(item["id"] == "adhd" for item in catalog["neuro"]))
        self.assertTrue(any(item["id"] == "neurospicy" for item in catalog["vibe"]))

    def test_register_swipe_match(self):
        payload = {
            "email": "ada@example.com",
            "password": "secret1",
            "name": "Ада",
            "age": 29,
            "city": "Нови-Сад",
            "gender": "woman",
            "looking_for": "everyone",
            "bio": "аутистка, ищу сдвгшника с таблицами",
            "neuro": ["asd"],
            "vibe": ["nonsmalltalk"],
        }
        created = self.client.post("/api/register", json=payload)
        self.assertEqual(created.status_code, 200, created.get_data(as_text=True))
        me = created.get_json()["user"]
        self.assertEqual(me["name"], "Ада")

        feed = self.client.get("/api/feed?neuro=adhd").get_json()
        self.assertTrue(feed["cards"])
        self.assertTrue(all("adhd" in card["neuro"] or "audhd" in card["neuro"] for card in feed["cards"]))
        target = feed["cards"][0]
        swipe = self.client.post("/api/swipe", json={"target_id": target["id"], "direction": "like"})
        self.assertEqual(swipe.status_code, 200)
        self.assertTrue(swipe.get_json()["matched"])
        matches = self.client.get("/api/matches").get_json()
        self.assertTrue(any(m["id"] == target["id"] for m in matches["matches"]))

    def test_demo_login(self):
        res = self.client.post("/api/demo")
        self.assertEqual(res.status_code, 200)
        feed = self.client.get("/api/feed").get_json()
        self.assertGreaterEqual(len(feed["cards"]), 6)

    def test_reject_underage(self):
        payload = {
            "email": "kid@example.com",
            "password": "secret1",
            "name": "Кид",
            "age": 16,
            "city": "Рига",
            "gender": "man",
            "looking_for": "everyone",
            "neuro": ["adhd"],
            "vibe": [],
        }
        res = self.client.post("/api/register", json=payload)
        self.assertEqual(res.status_code, 400)


if __name__ == "__main__":
    unittest.main()
