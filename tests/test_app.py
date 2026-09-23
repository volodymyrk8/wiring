import os
import tempfile
import unittest
from io import BytesIO
from unittest.mock import patch

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    os.environ.get("DATABASE_URL", "postgresql://wiring_dev:wiring_dev@127.0.0.1:5433/wiring_test"),
)
os.environ.setdefault("APP_SECRET_KEY", "test-secret")
os.environ["UPLOAD_DIR"] = os.path.join(tempfile.gettempdir(), f"wiring-uploads-{os.getpid()}")
os.environ["OPENAI_API_KEY"] = ""
os.environ["WIRING_SEED_AI"] = "0"
os.environ["ADMIN_TOKEN"] = "test-admin-token"

from PIL import Image

from app import app, db, init_db, _rate  # noqa: E402
from database import open_request_connection, table_names  # noqa: E402
from media import MediaError  # noqa: E402
from tests.spa_paths import SPA_SHELL_PATHS  # noqa: E402


class WiringTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def setUp(self):
        conn = open_request_connection()
        tables = table_names(conn)
        if tables:
            for t in tables:
                try:
                    conn.execute(f'TRUNCATE TABLE "{t}" RESTART IDENTITY CASCADE')
                except Exception:
                    pass
            from premium import ensure_default_code
            ensure_default_code(conn)
            conn.commit()
        else:
            init_db()
        conn.close()
        _rate.clear()
        app.config["TESTING"] = True
        self.client = app.test_client()

    def tearDown(self):
        pass

    def test_beta_plus_gift_grants_once(self):
        from premium import BETA_PLUS_GIFT_MIGRATION, ensure_beta_plus_gift, is_premium, plus_until

        self._register()
        self._login("ada@example.com")
        conn = open_request_connection()
        try:
            n = ensure_beta_plus_gift(conn)
            conn.commit()
            self.assertGreaterEqual(n, 1)
            row = conn.execute("SELECT * FROM users WHERE email = ?", ("ada@example.com",)).fetchone()
            self.assertTrue(is_premium(row))
            until_first = plus_until(row)
            n2 = ensure_beta_plus_gift(conn)
            conn.commit()
            self.assertEqual(n2, 0)
            row2 = conn.execute("SELECT * FROM users WHERE email = ?", ("ada@example.com",)).fetchone()
            self.assertEqual(plus_until(row2), until_first)
            applied = conn.execute(
                "SELECT 1 FROM app_migrations WHERE id = ?",
                (BETA_PLUS_GIFT_MIGRATION,),
            ).fetchone()
            self.assertTrue(applied)
        finally:
            conn.close()

    def test_health_and_catalog(self):
        health = self.client.get("/health").get_json()
        self.assertTrue(health["ok"])
        self.assertGreaterEqual(health["users"], 0)
        catalog = self.client.get("/api/catalog").get_json()
        self.assertTrue(any(item["id"] == "adhd" for item in catalog["neuro"]))
        self.assertTrue(any(item["id"] == "neurospicy" for item in catalog["vibe"]))
        adhd = next(item for item in catalog["neuro"] if item["id"] == "adhd")
        self.assertIn("СДВГ", adhd["expand"])
        self.assertTrue(adhd["tip"])

    def test_register_swipe_match(self):
        me = self._register()
        self.assertEqual(me["name"], "Ада")
        self.assertFalse(me["needs_profile"])
        self._peers(1)
        self._login("ada@example.com")
        # one peer with adhd
        self._logout()
        peer = self._register(
            email="adhd-peer@example.com",
            name="Адик",
            gender="man",
            neuro=["adhd"],
            photo="portraits/p03.jpg",
        )
        self._logout()
        self._login("ada@example.com")

        feed = self.client.get("/api/feed?neuro=adhd").get_json()
        self.assertTrue(feed["cards"])
        self.assertTrue(all("adhd" in card["neuro"] or "audhd" in card["neuro"] for card in feed["cards"]))
        target = feed["cards"][0]
        swipe = self.client.post("/api/swipe", json={"target_id": target["id"], "direction": "like"})
        self.assertEqual(swipe.status_code, 200)
        data = swipe.get_json()
        self.assertIn("matched", data)
        blocked = self.client.post("/api/messages", json={"to_id": 999999, "body": "привет"})
        self.assertEqual(blocked.status_code, 403)
        if data["matched"]:
            sent = self.client.post("/api/messages", json={"to_id": target["id"], "body": "привет, без small talk"})
            self.assertEqual(sent.status_code, 200, sent.get_data(as_text=True))
            thread = self.client.get(f"/api/messages/{target['id']}").get_json()
            self.assertEqual(thread["messages"][0]["body"], "привет, без small talk")
        else:
            lonely = self.client.post("/api/messages", json={"to_id": target["id"], "body": "привет"})
            self.assertEqual(lonely.status_code, 403)
        self.assertEqual(peer["name"], "Адик")

    def test_demo_login(self):
        self._peers(6)
        first = self.client.post("/api/demo")
        self.assertEqual(first.status_code, 200)
        first_email = first.get_json()["user"]["email"]
        self.assertTrue(first_email.startswith("guest-"))
        feed = self.client.get("/api/feed").get_json()
        self.assertGreaterEqual(len(feed["cards"]), 6)
        second = self.client.post("/api/demo")
        self.assertNotEqual(second.get_json()["user"]["email"], first_email)

    def test_pass_is_permanent_even_for_legacy_rewind(self):
        self._peers(3)
        self.client.post("/api/demo")
        feed = self.client.get("/api/feed").get_json()
        target = feed["cards"][0]
        self.client.post("/api/swipe", json={"target_id": target["id"], "direction": "pass"})
        ids = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertNotIn(target["id"], ids)
        rewind = self.client.post("/api/rewind")
        self.assertEqual(rewind.status_code, 409)
        ids = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertNotIn(target["id"], ids)

    def test_legacy_restart_cannot_restore_exclusions(self):
        self._peers(3)
        self.client.post("/api/demo")
        feed = self.client.get("/api/feed").get_json()
        first = feed["cards"][0]
        second = feed["cards"][1]
        self.client.post("/api/swipe", json={"target_id": first["id"], "direction": "pass"})
        self.client.post("/api/swipe", json={"target_id": second["id"], "direction": "like"})
        # Permanent exclusions cannot be reset by an older client.
        mid = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertNotIn(first["id"], mid)
        self.assertNotIn(second["id"], mid)
        restart = self.client.post("/api/deck/restart")
        self.assertEqual(restart.status_code, 410)
        again = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertNotIn(first["id"], again)
        self.assertNotIn(second["id"], again)

    def test_feed_delivery_is_persistent_per_user_and_view_is_not_a_swipe(self):
        me = self._register()
        self._peers(5)
        self._login("ada@example.com")
        first_response = self.client.get("/api/feed?limit=2")
        self.assertEqual(first_response.headers["Cache-Control"], "no-store")
        first = first_response.get_json()
        self.assertEqual(len(first["cards"]), 2)
        self.assertTrue(first["has_more"])
        target = first["cards"][0]["id"]
        self.assertEqual(self.client.post("/api/feed/view", json={"target_id": target}).status_code, 200)
        self.assertEqual(self.client.post("/api/feed/view", json={"target_id": target}).status_code, 200)
        self.assertEqual(self.client.post("/api/feed/view", json={"target_id": me["id"]}).status_code, 404)
        self._logout()
        self._login("ada@example.com")
        later = self.client.get("/api/feed?limit=30").get_json()
        self.assertEqual(len(later["cards"]), 3)
        self.assertFalse(later["has_more"])
        self.assertTrue({c["id"] for c in first["cards"]}.isdisjoint({c["id"] for c in later["cards"]}))
        self.assertEqual(self.client.get("/api/feed").get_json()["cards"], [])
        with app.app_context():
            conn = db()
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM swipes WHERE from_id = ?", (me["id"],)).fetchone()["n"], 0)
            row = conn.execute("SELECT * FROM feed_history WHERE user_id = ? AND other_id = ?", (me["id"], target)).fetchone()
            self.assertIsNotNone(row["viewed_at"])
            self.assertIsNone(row["excluded_at"])
        self._logout()
        self._register(email="new-viewer@example.com", name="Новый")
        others = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertIn(target, others)

    def test_feed_concurrent_requests_claim_disjoint_pages(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        me = self._register()
        self._peers(6)
        barrier = Barrier(2)

        def fetch_page():
            client = app.test_client()
            with client.session_transaction() as session:
                session["uid"] = me["id"]
            barrier.wait(timeout=5)
            response = client.get("/api/feed?limit=3")
            return response.status_code, response.get_json()

        with ThreadPoolExecutor(max_workers=2) as executor:
            jobs = [executor.submit(fetch_page) for _ in range(2)]
            pages = [job.result(timeout=20) for job in jobs]
        self.assertEqual([status for status, _ in pages], [200, 200])
        ids = [[c["id"] for c in page["cards"]] for _, page in pages]
        self.assertEqual([len(page) for page in ids], [3, 3])
        self.assertTrue(set(ids[0]).isdisjoint(ids[1]))

    def test_exclusion_survives_swipe_cleanup_and_migration_is_idempotent(self):
        from feed import ensure_feed_history
        me = self._register()
        self._peers(1)
        self._login("ada@example.com")
        target = self.client.get("/api/feed?limit=1").get_json()["cards"][0]["id"]
        self.assertEqual(self.client.post("/api/swipe", json={"target_id": target, "direction": "pass"}).status_code, 200)
        with app.app_context():
            conn = db()
            # Simulate a pre-migration pass with no history row.
            conn.execute("DELETE FROM feed_history WHERE user_id = ? AND other_id = ?", (me["id"], target))
            ensure_feed_history(conn)
            ensure_feed_history(conn)
            conn.execute("DELETE FROM swipes WHERE from_id = ? AND to_id = ?", (me["id"], target))
            conn.commit()
            row = conn.execute("SELECT excluded_at FROM feed_history WHERE user_id = ? AND other_id = ?", (me["id"], target)).fetchone()
            self.assertIsNotNone(row["excluded_at"])
        self.assertEqual(self.client.get("/api/feed").get_json()["cards"], [])

    def test_feed_filter_misses_do_not_consume_candidates(self):
        self._register()
        self._peers(2)
        self._login("ada@example.com")
        response = self.client.get("/api/feed?city=NoSuchTestCity&limit=2").get_json()
        self.assertEqual(response["cards"], [])
        self.assertFalse(response["has_more"])
        response = self.client.get("/api/feed?limit=2").get_json()
        self.assertEqual(len(response["cards"]), 2)

    def test_feed_reset_requires_current_premium(self):
        import time
        me = self._register()
        self._peers(1)
        self._login("ada@example.com")
        page = self.client.get("/api/feed").get_json()
        payload = {"generation": page["generation"], "plus": True}
        self.assertEqual(self.client.post("/api/feed/reset", json=payload).status_code, 403)
        with app.app_context():
            db().execute("UPDATE users SET premium_until = ? WHERE id = ?", (int(time.time()) - 1, me["id"]))
            db().commit()
        self.assertEqual(self.client.post("/api/feed/reset", json=payload).status_code, 403)
        self.assertEqual(self.client.get("/api/feed").get_json()["cards"], [])
        self._logout()
        self.assertEqual(self.client.post("/api/feed/reset", json=payload).status_code, 401)

    def test_feed_reset_preserves_exclusions_likes_messages_and_other_viewers(self):
        from premium import grant_premium
        import time
        me = self._register()
        self._peers(4)
        self._login("ada@example.com")
        page = self.client.get("/api/feed").get_json()
        liked, excluded, *repeat = [card["id"] for card in page["cards"]]
        self.client.post("/api/swipe", json={"target_id": liked, "direction": "like"})
        self.client.post("/api/swipe", json={"target_id": excluded, "direction": "pass"})
        with app.app_context():
            conn = db()
            grant_premium(conn, me["id"], 1)
            conn.execute("INSERT INTO messages (from_id, to_id, body, created_at) VALUES (?, ?, ?, ?)", (me["id"], liked, "keep", int(time.time())))
            conn.execute("INSERT INTO feed_history (user_id, other_id, delivered_at) VALUES (?, ?, ?)", (liked, me["id"], int(time.time())))
            conn.commit()
        result = self.client.post("/api/feed/reset", json={"generation": page["generation"], "user_id": liked})
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.get_json()["reset"])
        again = self.client.get("/api/feed").get_json()
        self.assertEqual({card["id"] for card in again["cards"]}, set(repeat))
        with app.app_context():
            conn = db()
            self.assertIsNotNone(conn.execute("SELECT excluded_at FROM feed_history WHERE user_id = ? AND other_id = ?", (me["id"], excluded)).fetchone()["excluded_at"])
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM swipes WHERE from_id = ?", (me["id"],)).fetchone()["n"], 2)
            self.assertEqual(conn.execute("SELECT COUNT(*) AS n FROM messages WHERE from_id = ?", (me["id"],)).fetchone()["n"], 1)
            self.assertIsNotNone(conn.execute("SELECT 1 FROM feed_history WHERE user_id = ? AND other_id = ?", (liked, me["id"])).fetchone())

    def test_feed_reset_retry_does_not_clear_new_delivery(self):
        from premium import grant_premium
        me = self._register()
        self._peers(2)
        self._login("ada@example.com")
        page = self.client.get("/api/feed").get_json()
        with app.app_context():
            grant_premium(db(), me["id"], 1)
            db().commit()
        for invalid in ({}, {"generation": -1}, {"generation": True}, {"generation": "0"}, []):
            self.assertEqual(self.client.post("/api/feed/reset", json=invalid).status_code, 400)
        payload = {"generation": page["generation"]}
        first = self.client.post("/api/feed/reset", json=payload).get_json()
        self.assertTrue(first["reset"])
        again = self.client.get("/api/feed").get_json()
        self.assertEqual(len(again["cards"]), 2)
        retry = self.client.post("/api/feed/reset", json=payload).get_json()
        self.assertFalse(retry["reset"])
        self.assertEqual(retry["generation"], first["generation"])
        self.assertEqual(self.client.get("/api/feed").get_json()["cards"], [])

    def test_reject_underage(self):
        self.client.post(
            "/api/register",
            json={
                "email": "kid@example.com",
                "password": "secret1",
                "name": "Кид",
                "age_confirm": True,
                "privacy_confirm": True,
            },
        )
        res = self.client.patch(
            "/api/me",
            json={
                "name": "Кид",
                "age": 16,
                "city": "Рига",
                "gender": "man",
                "looking_for": "everyone",
                "neuro": ["adhd"],
                "vibe": [],
                "special_data_consent": True,
                "photo_rights_consent": True,
                "photo": "portraits/p03.jpg",
            },
        )
        self.assertEqual(res.status_code, 400)

    def test_register_needs_clicked_privacy(self):
        payload = {
            "email": "nope@example.com",
            "password": "secret1",
            "name": "Нора",
            "age_confirm": True,
        }
        res = self.client.post("/api/register", json=payload)
        self.assertEqual(res.status_code, 400)
        self.assertIn("персональных данных", res.get_json()["error"])

    def test_email_verify_required_before_login(self):
        with patch("app.email_verify_enforced", return_value=True), patch("app.send_mail", return_value=True) as mail:
            res = self.client.post(
                "/api/register",
                json={
                    "email": "verify-me@example.com",
                    "password": "secret1",
                    "name": "Вера",
                    "age_confirm": True,
                    "privacy_confirm": True,
                },
            )
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            data = res.get_json()
            self.assertTrue(data["needs_email_verify"])
            self.assertEqual(data["email"], "verify-me@example.com")
            self.assertIsNone(self.client.get("/api/me").get_json()["user"])
            self.assertTrue(mail.called)
            self.assertIn("?verify=", mail.call_args[0][2])

        with patch("app.email_verify_enforced", return_value=True):
            blocked = self.client.post(
                "/api/login",
                json={"email": "verify-me@example.com", "password": "secret1"},
            )
            self.assertEqual(blocked.status_code, 403)
            self.assertTrue(blocked.get_json()["needs_email_verify"])

        conn = open_request_connection()
        row = conn.execute(
            "SELECT token FROM email_verifications ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        token = row["token"] if hasattr(row, "__getitem__") and not isinstance(row, (tuple, list)) else row[0]
        conn.close()

        verified = self.client.post("/api/email/verify", json={"token": token})
        self.assertEqual(verified.status_code, 200, verified.get_data(as_text=True))
        self.assertEqual(verified.get_json()["user"]["email"], "verify-me@example.com")
        me = self.client.get("/api/me").get_json()["user"]
        self.assertEqual(me["email"], "verify-me@example.com")

        with patch("app.email_verify_enforced", return_value=True), patch("app.send_mail", return_value=True) as mail2:
            again = self.client.post("/api/email/resend", json={"email": "verify-me@example.com"})
            self.assertEqual(again.status_code, 200)
            self.assertFalse(mail2.called)

        self._logout()
        with patch("app.email_verify_enforced", return_value=True):
            login = self.client.post(
                "/api/login",
                json={"email": "verify-me@example.com", "password": "secret1"},
            )
            self.assertEqual(login.status_code, 200)

    def test_legal_and_sitemap(self):
        self.assertEqual(self.client.get("/privacy").status_code, 200)
        self.assertEqual(self.client.get("/rules").status_code, 200)
        self.assertIn("чувствительные сведения", self.client.get("/privacy").get_data(as_text=True))
        self.assertIn("/support", self.client.get("/privacy").get_data(as_text=True))
        self.assertIn("Маркетинговые письма", self.client.get("/privacy").get_data(as_text=True))
        glossary = self.client.get("/glossary")
        self.assertEqual(glossary.status_code, 200)
        text = glossary.get_data(as_text=True)
        self.assertIn("ASD", text)
        self.assertIn("AuDHD", text)
        self.assertIn("ПТСР (PTSD)", text)
        self.assertIn("социофобия", text)
        self.assertIn("синдром Туретта", text)
        self.assertNotIn(">PDA<", text)
        self.assertNotIn(">RSD<", text)
        support = self.client.get("/support")
        self.assertEqual(support.status_code, 200)
        self.assertIn('id="app"', support.get_data(as_text=True))
        self.assertNotIn("hello@wiring.date", support.get_data(as_text=True))
        self.assertNotIn("hello@wiring.date", self.client.get("/privacy").get_data(as_text=True))
        self.assertNotIn("hello@wiring.date", self.client.get("/rules").get_data(as_text=True))
        sent = self.client.post("/support", data={"body": "не открывается анкета на телефоне"})
        self.assertEqual(sent.status_code, 200)
        self.assertIn("отправили", sent.get_data(as_text=True))
        short = self.client.post("/support", data={"body": "мало"})
        self.assertIn("подробнее", short.get_data(as_text=True))
        ajax_ok = self.client.post("/support", json={"body": "проблема с авторизацией через почту"}, headers={"X-Requested-With": "XMLHttpRequest"})
        self.assertEqual(ajax_ok.status_code, 200)
        self.assertTrue(ajax_ok.get_json().get("ok"))
        self.assertIn("отправили", ajax_ok.get_json().get("notice"))
        ajax_err = self.client.post("/support", json={"body": "мало"}, headers={"X-Requested-With": "XMLHttpRequest"})
        self.assertEqual(ajax_err.status_code, 400)
        self.assertFalse(ajax_err.get_json().get("ok"))
        self.assertIn("подробнее", ajax_err.get_json().get("error"))
        robots = self.client.get("/robots.txt")
        self.assertIn(b"Sitemap", robots.data)
        sitemap = self.client.get("/sitemap.xml")
        self.assertEqual(sitemap.status_code, 200)
        self.assertIn(b"/support", sitemap.data)
        self.assertNotIn(b"/glossary", sitemap.data)
        for path in ("/feed", "/likes", "/chats", "/me", "/sign-in", "/sign-up", "/login", "/register", "/verify", "/p/1", "/chats/1", "/r/abcd1234", "/support"):
            page = self.client.get(path)
            self.assertEqual(page.status_code, 200, path)
            self.assertIn(b"WIRING", page.data)

    def _register(self, email="ada@example.com", **extra):
        name = extra.pop("name", "Ада")
        password = extra.pop("password", "secret1")
        light = {
            "email": email,
            "password": password,
            "name": name,
            "age_confirm": True,
            "privacy_confirm": True,
        }
        if "ref" in extra:
            light["ref"] = extra.pop("ref")
        created = self.client.post("/api/register", json=light)
        self.assertEqual(created.status_code, 200, created.get_data(as_text=True))
        self.assertTrue(created.get_json()["user"]["needs_profile"])
        profile = {
            "name": name,
            "age": 29,
            "city": "Нови-Сад",
            "gender": "woman",
            "looking_for": "everyone",
            "bio": "аутистка, ищу сдвгшника с таблицами",
            "neuro": ["asd"],
            "vibe": ["nonsmalltalk"],
            "special_data_consent": True,
            "photo_rights_consent": True,
            "photo": "portraits/p01.jpg",
            "intent": "dating",
            "job": "таблицы",
        }
        profile.update(extra)
        profile.setdefault("special_data_consent", True)
        profile.setdefault("photo_rights_consent", True)
        patched = self.client.patch("/api/me", json=profile)
        self.assertEqual(patched.status_code, 200, patched.get_data(as_text=True))
        user = patched.get_json()["user"]
        self.assertFalse(user["needs_profile"])
        return user

    def _logout(self):
        self.client.post("/api/logout")

    def _login(self, email, password="secret1"):
        res = self.client.post("/api/login", json={"email": email, "password": password})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        return res.get_json()["user"]

    def _peers(self, n=6, **extra):
        """Create n complete profiles and leave the client logged out."""
        photos = [f"portraits/p0{i}.jpg" for i in range(1, 10)]
        peers = []
        for i in range(n):
            self._logout()
            peers.append(
                self._register(
                    email=f"peer{i}-{n}@example.com",
                    name=f"Пир{i}",
                    gender="man" if i % 2 else "woman",
                    age=20 + (i % 20),
                    neuro=["adhd"] if i % 2 else ["asd"],
                    photo=photos[i % len(photos)],
                    **extra,
                )
            )
        self._logout()
        return peers

    def test_light_register_then_profile(self):
        created = self.client.post(
            "/api/register",
            json={
                "email": "soft@example.com",
                "password": "secret1",
                "name": "Соня",
                "age_confirm": True,
                "privacy_confirm": True,
            },
        )
        self.assertEqual(created.status_code, 200, created.get_data(as_text=True))
        me = created.get_json()["user"]
        self.assertTrue(me["needs_profile"])
        self.assertEqual(me["name"], "Соня")
        self.assertEqual(me["city"], "")
        feed_ids = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertNotIn(me["id"], feed_ids)

    def _jpeg(self, size=(400, 500), color=(30, 40, 50)):
        buf = BytesIO()
        Image.new("RGB", size, color).save(buf, "JPEG")
        buf.seek(0)
        return buf

    def test_photo_upload_and_primary(self):
        self._register()
        denied = self.client.post("/api/albums", json={"title": "special interest"})
        self.assertEqual(denied.status_code, 400)
        uploaded = self.client.post(
            "/api/photos",
            data={"file": (self._jpeg(), "shot.jpg")},
        )
        self.assertEqual(uploaded.status_code, 200, uploaded.get_data(as_text=True))
        photo = uploaded.get_json()["photo"]
        self.assertTrue(photo["url"].startswith("/media/"))
        patched = self.client.patch(f"/api/photos/{photo['id']}", json={"is_primary": True})
        self.assertEqual(patched.status_code, 200)
        me = self.client.get("/api/me").get_json()["user"]
        self.assertTrue(me["photo"].startswith("/media/"))
        self.assertGreaterEqual(len(me["photos"]), 2)
        photo_id = photo["id"]
        deleted = self.client.delete(f"/api/photos/{photo_id}")
        self.assertEqual(deleted.status_code, 200, deleted.get_data(as_text=True))
        after = self.client.get("/api/me").get_json()["user"]
        ids = [item["id"] for item in after["photos"] if isinstance(item, dict)]
        self.assertNotIn(photo_id, ids)

    def test_blocked_photo_is_rejected(self):
        self._register()
        with patch("app.moderate_photo", side_effect=MediaError("это фото нельзя загрузить")):
            res = self.client.post(
                "/api/photos",
                data={"file": (self._jpeg(), "shot.jpg")},
            )
        self.assertEqual(res.status_code, 400)
        self.assertIn("нельзя", res.get_json()["error"])

    def test_guest_cannot_upload(self):
        self.client.post("/api/demo")
        res = self.client.post(
            "/api/photos",
            data={"file": (self._jpeg(), "shot.jpg")},
        )
        self.assertEqual(res.status_code, 403)

    def test_block_hides_from_feed(self):
        self._register()
        self._peers(2)
        self._login("ada@example.com")
        feed = self.client.get("/api/feed").get_json()
        target = feed["cards"][0]
        blocked = self.client.post("/api/block", json={"user_id": target["id"]})
        self.assertEqual(blocked.status_code, 200)
        ids = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertNotIn(target["id"], ids)

    def test_likes_inbox_and_unread(self):
        first = self._register()
        self.client.post("/api/logout")
        second = self._register(email="leo@example.com", name="Лео", gender="man", photo="portraits/p03.jpg")
        liked = self.client.post("/api/swipe", json={"target_id": first["id"], "direction": "like"})
        self.assertEqual(liked.status_code, 200)
        self.assertFalse(liked.get_json()["matched"])
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "ada@example.com", "password": "secret1"})
        inbox = self.client.get("/api/likes").get_json()
        self.assertFalse(inbox["plus"])
        self.assertTrue(inbox["likes"])
        self.assertTrue(all(p.get("hidden") for p in inbox["likes"]))
        self.assertFalse(any("id" in p or "name" in p or "photo" in p for p in inbox["likes"]))
        me = self.client.get("/api/me").get_json()["user"]
        self.assertGreaterEqual(me["likes_in"], 1)
        back = self.client.post("/api/swipe", json={"target_id": second["id"], "direction": "like"})
        self.assertTrue(back.get_json()["matched"])
        after_match = self.client.get("/api/likes").get_json()
        self.assertFalse(any(p.get("id") == second["id"] for p in after_match["likes"] if not p.get("hidden")))
        self.assertFalse(any(p.get("matched") for p in after_match["likes"]))
        self.assertEqual(self.client.get("/api/me").get_json()["user"]["likes_in"], 0)
        self._plus()
        visible = self.client.get("/api/likes").get_json()
        self.assertTrue(visible["plus"])
        self.assertFalse(any(p.get("id") == second["id"] for p in visible["likes"]))
        matches = self.client.get("/api/matches").get_json()["matches"]
        self.assertTrue(any(m["id"] == second["id"] for m in matches))
        blocked_pass = self.client.post("/api/swipe", json={"target_id": second["id"], "direction": "pass"})
        self.assertEqual(blocked_pass.status_code, 409)
        self.assertTrue(blocked_pass.get_json().get("matched"))
        still = self.client.get("/api/matches").get_json()["matches"]
        self.assertTrue(any(m["id"] == second["id"] for m in still))
        rewind_blocked = self.client.post("/api/rewind")
        self.assertEqual(rewind_blocked.status_code, 409)
        self.client.post("/api/messages", json={"to_id": second["id"], "body": "привет без small talk"})
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "leo@example.com", "password": "secret1"})
        matches = self.client.get("/api/matches").get_json()["matches"]
        other = next(m for m in matches if m["id"] == first["id"])
        self.assertGreaterEqual(other["unread"], 1)

    def test_matches_sort_and_unmatch_passes(self):
        ada = self._register()
        self.client.post("/api/logout")
        leo = self._register(email="leo2@example.com", name="Лео", gender="man", photo="portraits/p03.jpg")
        self.client.post("/api/swipe", json={"target_id": ada["id"], "direction": "like"})
        self.client.post("/api/logout")
        mia = self._register(email="mia@example.com", name="Миа", gender="woman", photo="portraits/p02.jpg")
        self.client.post("/api/swipe", json={"target_id": ada["id"], "direction": "like"})
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "ada@example.com", "password": "secret1"})
        self.client.post("/api/swipe", json={"target_id": leo["id"], "direction": "like"})
        self.client.post("/api/messages", json={"to_id": leo["id"], "body": "старый чат"})
        self.client.post("/api/swipe", json={"target_id": mia["id"], "direction": "like"})
        matches = self.client.get("/api/matches").get_json()["matches"]
        ids = [m["id"] for m in matches]
        self.assertEqual(ids[0], mia["id"], "свежий мэтч без сообщений выше старого чата")
        self.assertIn(leo["id"], ids)
        self.client.post("/api/messages", json={"to_id": mia["id"], "body": "история должна остаться"})
        gone = self.client.post("/api/unmatch", json={"user_id": mia["id"]})
        self.assertEqual(gone.status_code, 200)
        with app.app_context():
            row = db().execute(
                "SELECT body, deleted_at FROM messages WHERE from_id = ? AND to_id = ?",
                (ada["id"], leo["id"]),
            ).fetchone()
            self.assertIsNotNone(row)
            self.assertIsNone(row["deleted_at"], "unmatching another chat must not touch its history")
            mia_row = db().execute(
                "SELECT body, deleted_at FROM messages WHERE from_id = ? AND to_id = ?",
                (ada["id"], mia["id"]),
            ).fetchone()
            self.assertIsNotNone(mia_row, "unmatching must keep the message row")
            self.assertEqual(mia_row["body"], "история должна остаться")
            self.assertGreater(mia_row["deleted_at"], 0, "unmatching must soft-delete messages")
        after = {m["id"] for m in self.client.get("/api/matches").get_json()["matches"]}
        self.assertNotIn(mia["id"], after)
        feed_ids = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertNotIn(mia["id"], feed_ids)
        likes = self.client.get("/api/likes").get_json()["likes"]
        self.assertFalse(any(p.get("id") == mia["id"] for p in likes if not p.get("hidden")))

    def test_age_filter(self):
        self._register()
        self._logout()
        self._register(email="young@example.com", name="Юля", age=20, gender="man", photo="portraits/p02.jpg")
        self._logout()
        self._register(email="old@example.com", name="Серж", age=35, gender="man", photo="portraits/p03.jpg")
        self._logout()
        self._login("ada@example.com")
        young = self.client.get("/api/feed?min_age=18&max_age=22").get_json()
        self.assertTrue(young["cards"])
        self.assertTrue(all(c["age"] <= 22 for c in young["cards"]))
        old = self.client.get("/api/feed?min_age=30&max_age=99").get_json()
        self.assertTrue(old["cards"])
        self.assertTrue(all(c["age"] >= 30 for c in old["cards"]))

    def test_prompts_saved(self):
        user = self._register(
            prompts=[{"id": "special", "answer": "таблицы и ночные поезда"}],
            communication="сразу по делу, без как дела",
        )
        self.assertEqual(user["prompts"][0]["id"], "special")
        self.assertIn("поезда", user["prompts"][0]["answer"])
        person = self.client.get(f"/api/people/{user['id']}").get_json()["person"]
        self.assertEqual(person["communication"], "сразу по делу, без как дела")

    def test_no_seed_profiles(self):
        self._register()
        with app.app_context():
            from app import db

            seed_ids = [int(row["id"]) for row in db().execute("SELECT id FROM users WHERE is_seed = 1")]
            demo = [
                int(row["id"])
                for row in db().execute("SELECT id FROM users WHERE email LIKE '%@wiring.demo'")
            ]
        self.assertEqual(seed_ids, [])
        self.assertEqual(demo, [])

    def test_city_normalize(self):
        user = self._register(city="Pscov")
        self.assertEqual(user["city"], "Псков")
        self.client.patch("/api/me", json={
            "name": "Ада",
            "age": 29,
            "city": "Gomel'",
            "gender": "woman",
            "looking_for": "everyone",
            "bio": "аутистка",
            "neuro": ["asd"],
            "vibe": [],
            "special_data_consent": True,
            "photo_rights_consent": True,
            "photo": "portraits/p01.jpg",
        })
        me = self.client.get("/api/me").get_json()["user"]
        self.assertEqual(me["city"], "Гомель")
        bad = self.client.patch(
            "/api/me",
            json={
                "name": "Ада",
                "age": 29,
                "city": "Буеракираки",
                "gender": "woman",
                "looking_for": "everyone",
                "bio": "аутистка",
                "neuro": ["asd"],
                "vibe": ["neurospicy"],
                "special_data_consent": True,
                "photo_rights_consent": True,
                "photo": "portraits/p01.jpg",
            },
        )
        self.assertEqual(bad.status_code, 400)
        self.assertIn("списка", bad.get_json()["error"])

    def test_tags_survive_bio_edit(self):
        user = self._register(neuro=["asd", "anxiety"], vibe=["neurospicy", "nonsmalltalk"])
        self.assertIn("asd", user["neuro"])
        self.assertIn("neurospicy", user["vibe"])
        patched = self.client.patch(
            "/api/me",
            json={
                "name": "Ада",
                "age": 29,
                "city": "Нови-Сад",
                "gender": "woman",
                "looking_for": "everyone",
                "bio": "первая строка\n\nвторая строка",
                "neuro": ["asd", "anxiety"],
                "vibe": ["neurospicy", "nonsmalltalk"],
                "special_data_consent": True,
                "photo_rights_consent": True,
                "photo": "portraits/p01.jpg",
                "intent": "dating",
                "job": "таблицы",
            },
        )
        self.assertEqual(patched.status_code, 200, patched.get_data(as_text=True))
        again = patched.get_json()["user"]
        self.assertEqual(set(again["neuro"]), {"asd", "anxiety"})
        self.assertEqual(set(again["vibe"]), {"neurospicy", "nonsmalltalk"})
        self.assertIn("\n", again["bio"])

    def test_profanity_blocked_in_profile(self):
        self._register()
        dirty = self.client.patch(
            "/api/me",
            json={
                "name": "Ада",
                "age": 29,
                "city": "Нови-Сад",
                "gender": "woman",
                "looking_for": "everyone",
                "bio": "ГОВНО",
                "neuro": ["asd"],
                "vibe": [],
                "special_data_consent": True,
                "photo_rights_consent": True,
                "photo": "portraits/p01.jpg",
                "job": "хуй",
            },
        )
        self.assertEqual(dirty.status_code, 400)
        self.assertIn("мат", dirty.get_json()["error"])

    def test_onboard_and_skip(self):
        created = self.client.post(
            "/api/register",
            json={
                "email": "later@example.com",
                "password": "secret1",
                "name": "Лера",
                "age_confirm": True,
                "privacy_confirm": True,
            },
        )
        self.assertTrue(created.get_json()["user"]["needs_profile"])
        skip = self.client.post("/api/onboard/skip")
        self.assertEqual(skip.status_code, 200)
        # skip alone does not complete a hollow profile
        me = self.client.get("/api/me").get_json()["user"]
        self.assertTrue(me["needs_profile"])

    def test_guest_nudge_after_three_likes(self):
        self._peers(3)
        self.client.post("/api/demo")
        feed = self.client.get("/api/feed").get_json()
        last = None
        for card in feed["cards"][:3]:
            last = self.client.post("/api/swipe", json={"target_id": card["id"], "direction": "like"}).get_json()
        self.assertTrue(last["guest_nudge"])
        me = self.client.get("/api/me").get_json()["user"]
        self.assertTrue(me["guest_nudge"])

    def test_chat_openers(self):
        first = self._register(prompts=[{"id": "special", "answer": "ночные поезда и таблицы"}])
        self.client.post("/api/logout")
        leo = self._register(email="leo@example.com", name="Лео", gender="man", photo="portraits/p03.jpg")
        self.client.post("/api/swipe", json={"target_id": first["id"], "direction": "like"})
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "ada@example.com", "password": "secret1"})
        self.client.post("/api/swipe", json={"target_id": leo["id"], "direction": "like"})
        other = self.client.get("/api/matches").get_json()["matches"][0]
        thread = self.client.get(f"/api/messages/{other['id']}").get_json()
        self.assertEqual(len(thread["openers"]), 3)
        self.assertTrue(all(thread["openers"]))

    def test_chat_photo_message(self):
        ada = self._register()
        self.client.post("/api/logout")
        leo = self._register(email="leo-photo@example.com", name="Лео", gender="man", photo="portraits/p03.jpg")
        self.client.post("/api/swipe", json={"target_id": ada["id"], "direction": "like"})
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "ada@example.com", "password": "secret1"})
        self.client.post("/api/swipe", json={"target_id": leo["id"], "direction": "like"})
        with patch("app.moderate_photo") as mod:
            sent = self.client.post(
                "/api/messages/photo",
                data={"to_id": str(leo["id"]), "body": "смотри", "file": (self._jpeg(), "chat.jpg")},
                content_type="multipart/form-data",
            )
        self.assertEqual(sent.status_code, 200, sent.get_data(as_text=True))
        mod.assert_called_once()
        thread = self.client.get(f"/api/messages/{leo['id']}").get_json()
        msg = thread["messages"][-1]
        self.assertEqual(msg["body"], "смотри")
        self.assertTrue(msg["photo_url"])
        media = self.client.get(msg["photo_url"])
        self.assertEqual(media.status_code, 200)
        self.assertTrue(media.data[:3] == b"\xff\xd8\xff" or media.mimetype.startswith("image"))
        media.close()
        with patch("app.moderate_photo", side_effect=MediaError("это фото нельзя загрузить")):
            blocked = self.client.post(
                "/api/messages/photo",
                data={"to_id": str(leo["id"]), "file": (self._jpeg((420, 420), (90, 20, 20)), "bad.jpg")},
                content_type="multipart/form-data",
            )
        self.assertEqual(blocked.status_code, 400)

    def test_chat_intent_allows_profile_without_city(self):
        self._register()
        self._login("ada@example.com")
        body = {
            "name": "Ада",
            "age": 29,
            "city": "",
            "gender": "woman",
            "looking_for": "everyone",
            "bio": "пишу без привязки к городу",
            "neuro": ["asd"],
            "vibe": ["nonsmalltalk"],
            "intents": ["chat"],
            "special_data_consent": True,
            "photo_rights_consent": True,
            "photo": "portraits/p01.jpg",
            "job": "",
        }
        patched = self.client.patch("/api/me", json=body)
        self.assertEqual(patched.status_code, 200, patched.get_data(as_text=True))
        user = patched.get_json()["user"]
        self.assertFalse(user["needs_profile"])
        self.assertFalse(user["needs_city"])

    def test_profile_can_clear_city_on_save(self):
        self._register()
        self._login("ada@example.com")
        cleared = self.client.patch(
            "/api/me",
            json={
                "name": "Ада",
                "age": 29,
                "city": "",
                "gender": "woman",
                "looking_for": "everyone",
                "bio": "пишу",
                "neuro": ["asd"],
                "intents": ["chat"],
                "special_data_consent": True,
                "photo_rights_consent": True,
                "photo": "portraits/p01.jpg",
            },
        )
        self.assertEqual(cleared.status_code, 200, cleared.get_data(as_text=True))
        self.assertEqual(cleared.get_json()["user"]["city"], "")

    def test_dating_intent_allows_empty_city(self):
        self._register()
        self._login("ada@example.com")
        body = {
            "name": "Ада",
            "age": 29,
            "city": "",
            "gender": "woman",
            "looking_for": "everyone",
            "bio": "ищу",
            "neuro": ["asd"],
            "intents": ["dating", "chat", "friends"],
            "special_data_consent": True,
            "photo_rights_consent": True,
            "photo": "portraits/p01.jpg",
        }
        patched = self.client.patch("/api/me", json=body)
        self.assertEqual(patched.status_code, 200, patched.get_data(as_text=True))
        user = patched.get_json()["user"]
        self.assertFalse(user["needs_profile"])
        self.assertFalse(user["needs_city"])
        self.assertEqual(user["city"], "")

    def test_admin_stats_matches_and_chats(self):
        from admin import collect_stats

        first = self._register()
        self.client.post("/api/logout")
        second = self._register(
            email="stats-chat@example.com",
            name="Стат",
            gender="man",
            photo="portraits/p02.jpg",
        )
        self.client.post("/api/swipe", json={"target_id": first["id"], "direction": "like"})
        self.client.post("/api/logout")
        self._login("ada@example.com")
        matched = self.client.post("/api/swipe", json={"target_id": second["id"], "direction": "like"})
        self.assertTrue(matched.get_json()["matched"])

        conn = open_request_connection()
        try:
            before = collect_stats(conn)
            self.assertGreaterEqual(before["matches_total"], 1)
            self.assertGreaterEqual(before["matches_real"], 1)
            self.assertEqual(before["match_chats"], 0)
            self.assertEqual(before["match_chats_real"], 0)

            sent = self.client.post("/api/messages", json={"to_id": second["id"], "body": "привет"})
            self.assertEqual(sent.status_code, 200)
            after = collect_stats(conn)
            self.assertGreaterEqual(after["match_chats"], 1)
            self.assertGreaterEqual(after["match_chats_real"], 1)
        finally:
            conn.close()

    def test_admin_requires_token(self):
        denied = self.client.post("/admin", data={"token": "nope"})
        self.assertEqual(denied.status_code, 403)
        form = self.client.get("/admin")
        self.assertEqual(form.status_code, 200)
        self.assertIn("токен", form.get_data(as_text=True))
        ok = self.client.post("/admin", data={"token": "test-admin-token"})
        self.assertEqual(ok.status_code, 200)
        body = ok.get_data(as_text=True)
        self.assertIn("живые", body)
        self.assertIn("мэтчи", body)
        self.assertIn("популярные фильтры", body)

    def test_local_admin_login_is_loopback_only(self):
        with patch.dict(os.environ, {
            "ADMIN_TOKEN": "",
            "LOCAL_ADMIN_LOGIN": "LEX",
            "LOCAL_ADMIN_PASSWORD": "local-only-test-password",
            "FLASK_DEBUG": "0",
        }, clear=False):
            form = self.client.get("/admin")
            self.assertEqual(form.status_code, 200)
            self.assertIn("LEX", form.get_data(as_text=True))
            denied = self.client.post("/admin", data={"login": "LEX", "password": "nope"})
            self.assertEqual(denied.status_code, 403)
            ok = self.client.post("/admin", data={"login": "LEX", "password": "local-only-test-password"})
            self.assertEqual(ok.status_code, 200)
            self.assertIn("живые", ok.get_data(as_text=True))
            external = self.client.get("/admin", base_url="https://example.com")
            self.assertEqual(external.status_code, 404)

    def test_admin_accepts_multiple_configured_tokens(self):
        with patch.dict(os.environ, {"ADMIN_TOKEN": "old-local-token,new-local-token"}, clear=False):
            for token in ("old-local-token", "new-local-token"):
                client = app.test_client()
                ok = client.post("/admin", data={"token": token})
                self.assertEqual(ok.status_code, 200)
                self.assertIn("живые", ok.get_data(as_text=True))

    def _plus(self):
        redeemed = self.client.post("/api/premium/redeem", json={"code": "WIRINGPLUS"})
        self.assertEqual(redeemed.status_code, 200, redeemed.get_data(as_text=True))
        return redeemed.get_json()["user"]

    def test_example_accounts_are_not_live(self):
        self._register()
        self._plus()
        self._register(email="leo@example.com", name="Лео", gender="man", photo="portraits/p03.jpg")
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "ada@example.com", "password": "secret1"})
        live = self.client.get("/api/feed?real=1").get_json()["cards"]
        everyone = self.client.get("/api/feed").get_json()["cards"]
        self.assertTrue(any(c["name"] == "Лео" for c in everyone))
        self.assertFalse(any(c["name"] == "Лео" for c in live))
        self.assertGreater(len(everyone), len(live))

    def test_plus_redeem_and_real_feed(self):
        user = self._register()
        self.assertFalse(user.get("plus"))
        self._logout()
        self._register(email="live@mail.test", name="Живой", gender="man", photo="portraits/p02.jpg")
        self._logout()
        self._register(email="leo@example.com", name="Лео", gender="man", photo="portraits/p03.jpg")
        self._logout()
        self._login("ada@example.com")
        with app.app_context():
            target_id = db().execute("SELECT id FROM users WHERE email = ?", ("leo@example.com",)).fetchone()["id"]
        denied = self.client.post("/api/swipe", json={"target_id": target_id, "direction": "snooze"})
        self.assertEqual(denied.status_code, 403)
        plus = self._plus()
        self.assertTrue(plus["plus"])
        live = self.client.get("/api/feed?real=1").get_json()["cards"]
        all_cards = self.client.get("/api/feed").get_json()["cards"]
        self.assertTrue(any(c["name"] == "Лео" for c in all_cards))
        self.assertTrue(any(c["name"] == "Живой" for c in live))
        self.assertFalse(any(c["name"] == "Лео" for c in live))

    def test_plus_incognito_and_pause(self):
        ada = self._register()
        self._plus()
        self.client.patch("/api/plus", json={"incognito": True})
        self.client.post("/api/logout")
        self._register(email="leo@example.com", name="Лео", gender="man", photo="portraits/p03.jpg")
        ids = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertNotIn(ada["id"], ids)
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "ada@example.com", "password": "secret1"})
        self.client.patch("/api/plus", json={"incognito": False, "paused": True})
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "leo@example.com", "password": "secret1"})
        ids = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertNotIn(ada["id"], ids)

    def test_notification_preferences(self):
        self._register()
        me = self.client.get("/api/me").get_json()["user"]
        self.assertTrue(me.get("notify_enabled", True))
        off = self.client.patch("/api/notifications", json={"enabled": False})
        self.assertTrue(off.get_json()["ok"])
        self.assertFalse(off.get_json()["user"]["notify_enabled"])
        on = self.client.patch("/api/notifications", json={"enabled": True, "push": True})
        self.assertTrue(on.get_json()["user"]["notify_enabled"])
        self.assertTrue(on.get_json()["user"]["notify_push"])

    def test_plus_snooze(self):
        self._register()
        self._peers(2)
        self._login("ada@example.com")
        self._plus()
        feed = self.client.get("/api/feed").get_json()
        target = feed["cards"][0]
        snoozed = self.client.post("/api/swipe", json={"target_id": target["id"], "direction": "snooze"})
        self.assertEqual(snoozed.status_code, 200)
        ids = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertNotIn(target["id"], ids)
        back = self.client.post("/api/rewind")
        self.assertEqual(back.status_code, 200)
        ids = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertNotIn(target["id"], ids)

    def test_admin_can_grant_plus(self):
        self._register()
        self.client.post("/api/logout")
        self.client.post("/admin", data={"token": "test-admin-token"})
        granted = self.client.post("/admin/premium", data={"who": "ada@example.com", "days": "30"}, follow_redirects=True)
        self.assertEqual(granted.status_code, 200)
        self.client.post("/api/login", json={"email": "ada@example.com", "password": "secret1"})
        me = self.client.get("/api/me").get_json()["user"]
        self.assertTrue(me["plus"])

    def test_spa_shell_routes_return_html(self):
        for path in SPA_SHELL_PATHS:
            res = self.client.get(path)
            self.assertEqual(res.status_code, 200, path)
            self.assertIn(b'id="app"', res.data)

    def test_like_notice_for_real_user(self):
        first = self._register(email="like-a@wiring.test")
        self.client.post("/api/logout")
        self._register(email="like-b@wiring.test", name="Лео", gender="man", photo="portraits/p03.jpg")
        self.client.post("/api/swipe", json={"target_id": first["id"], "direction": "like"})
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "like-a@wiring.test", "password": "secret1"})
        me = self.client.get("/api/me").get_json()["user"]
        self.assertTrue(any(n["kind"] == "like" for n in me["notices"]))

    def test_message_notice_and_inbox(self):
        first = self._register(email="msg-a@wiring.test")
        self.client.post("/api/logout")
        second = self._register(email="msg-b@wiring.test", name="Лео", gender="man", photo="portraits/p03.jpg")
        self.client.post("/api/swipe", json={"target_id": first["id"], "direction": "like"})
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "msg-a@wiring.test", "password": "secret1"})
        self.client.post("/api/swipe", json={"target_id": second["id"], "direction": "like"})
        self.client.post("/api/messages", json={"to_id": second["id"], "body": "привет без small talk"})
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "msg-b@wiring.test", "password": "secret1"})
        inbox = self.client.get("/api/inbox").get_json()
        self.assertGreaterEqual(inbox["unread"], 1)
        self.assertTrue(any(n["kind"] == "message" and "привет" in n["body"] for n in inbox["notices"]))
        self.client.get(f"/api/messages/{first['id']}")
        after = self.client.get("/api/inbox").get_json()
        self.assertFalse(any(n["kind"] == "message" for n in after["notices"]))

    def test_referral_grants_plus_to_both(self):
        ada = self._register()
        self.assertFalse(ada.get("plus"))
        self.assertTrue(ada.get("ref"))
        self.assertTrue(ada.get("ref_url", "").endswith("/r/" + ada["ref"]))
        self.assertEqual(ada.get("ref_count"), 0)
        self.client.post("/api/logout")
        leo = self._register(email="leo@example.com", name="Лео", gender="man", photo="portraits/p03.jpg", ref=ada["ref"])
        self.assertTrue(leo["plus"])
        self.assertGreater(leo["plus_until"], 0)
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "ada@example.com", "password": "secret1"})
        me = self.client.get("/api/me").get_json()["user"]
        self.assertTrue(me["plus"])
        self.assertEqual(me["ref_count"], 1)
        self.assertTrue(any(n["kind"] == "referral" for n in me["notices"]))

    def test_bad_referral_still_registers(self):
        user = self._register(ref="nope")
        self.assertFalse(user.get("plus"))
        self.assertEqual(user.get("ref_count"), 0)

    def test_feed_respects_mutual_looking(self):
        man = self._register(email="man@example.com", name="Макс", gender="man", looking_for="women", photo="portraits/p03.jpg")
        self.client.post("/api/logout")
        woman = self._register(email="woman@example.com", name="Мира", gender="woman", looking_for="men", photo="portraits/p01.jpg")
        woman_id = woman["id"]
        self.client.post("/api/logout")
        other_man = self._register(email="bro@example.com", name="Боря", gender="man", looking_for="everyone", photo="portraits/p02.jpg")
        other_man_id = other_man["id"]
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "man@example.com", "password": "secret1"})
        ids = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertIn(woman_id, ids)
        self.assertNotIn(other_man_id, ids)
        self.assertNotIn(man["id"], ids)
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "woman@example.com", "password": "secret1"})
        ids = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertIn(man["id"], ids)
        self.assertNotIn(woman_id, ids)

    def test_feed_respects_discovery_filters(self):
        host = self._register(
            email="host@example.com",
            name="Хост",
            gender="woman",
            looking_for="everyone",
            age=30,
            city="Нови-Сад",
            seek_min_age=25,
            seek_max_age=35,
            seek_place="Сербия",
            hide_tags=["adhd"],
            photo="portraits/p01.jpg",
        )
        host_id = host["id"]
        self.assertEqual(host["seek_min_age"], 25)
        self.assertEqual(host["seek_max_age"], 35)
        self.assertEqual(host["seek_place"], "Сербия")
        self.assertIn("adhd", host["hide_tags"])
        self.client.post("/api/logout")
        young = self._register(
            email="young@example.com",
            name="Юля",
            gender="woman",
            looking_for="everyone",
            age=22,
            city="Нови-Сад",
            photo="portraits/p02.jpg",
        )
        self.client.post("/api/logout")
        foreign = self._register(
            email="foreign@example.com",
            name="Федя",
            gender="man",
            looking_for="everyone",
            age=28,
            city="Москва",
            photo="portraits/p03.jpg",
        )
        self.client.post("/api/logout")
        tagged = self._register(
            email="tagged@example.com",
            name="Тима",
            gender="man",
            looking_for="everyone",
            age=29,
            city="Нови-Сад",
            neuro=["adhd"],
            photo="portraits/p04.jpg",
        )
        self.client.post("/api/logout")
        ok = self._register(
            email="ok@example.com",
            name="Оля",
            gender="woman",
            looking_for="everyone",
            age=28,
            city="Белград",
            neuro=["asd"],
            photo="portraits/p05.jpg",
        )
        for email in ("young@example.com", "foreign@example.com", "tagged@example.com", "ok@example.com"):
            self.client.post("/api/logout")
            self.client.post("/api/login", json={"email": email, "password": "secret1"})
            ids = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
            if email == "ok@example.com":
                self.assertIn(host_id, ids)
            else:
                self.assertNotIn(host_id, ids)
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "host@example.com", "password": "secret1"})
        # onboard-style patch without seek fields must keep filters
        keep = self.client.patch(
            "/api/me",
            json={
                "name": "Хост",
                "age": 30,
                "city": "Нови-Сад",
                "gender": "woman",
                "looking_for": "everyone",
                "bio": "аутистка, ищу сдвгшника с таблицами",
                "neuro": ["asd"],
                "vibe": ["nonsmalltalk"],
                "special_data_consent": True,
                "photo_rights_consent": True,
                "photo": "portraits/p01.jpg",
                "intent": "dating",
                "job": "таблицы",
            },
        )
        self.assertEqual(keep.status_code, 200)
        user = keep.get_json()["user"]
        self.assertEqual(user["seek_min_age"], 25)
        self.assertEqual(user["seek_place"], "Сербия")
        self.assertIn("adhd", user["hide_tags"])
        # фильтры «кто меня находит» не сужают мою ленту
        ok_id = ok["id"]
        ids = {c["id"] for c in self.client.get("/api/feed").get_json()["cards"]}
        self.assertIn(ok_id, ids)
        self.assertIn(young["id"], ids)
        self.assertIn(foreign["id"], ids)
        self.assertIn(tagged["id"], ids)

    def test_chat_time_and_read(self):
        ada = self._register()
        self.client.post("/api/logout")
        leo = self._register(email="leo@example.com", name="Лео", gender="man", photo="portraits/p03.jpg")
        self.client.post("/api/swipe", json={"target_id": ada["id"], "direction": "like"})
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "ada@example.com", "password": "secret1"})
        self.client.post("/api/swipe", json={"target_id": leo["id"], "direction": "like"})
        sent = self.client.post("/api/messages", json={"to_id": leo["id"], "body": "привет без small talk"})
        self.assertEqual(sent.status_code, 200)
        chats = self.client.get("/api/matches").get_json()["matches"]
        row = next(m for m in chats if m["id"] == leo["id"])
        self.assertTrue(row["last_at"])
        self.assertIn("привет", row["last_message"])
        thread = self.client.get(f"/api/messages/{leo['id']}").get_json()
        mine = thread["messages"][-1]
        self.assertTrue(mine["mine"])
        self.assertFalse(mine["read"])
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "leo@example.com", "password": "secret1"})
        self.client.get(f"/api/messages/{ada['id']}")
        self.client.post("/api/logout")
        self.client.post("/api/login", json={"email": "ada@example.com", "password": "secret1"})
        again = self.client.get(f"/api/messages/{leo['id']}").get_json()
        self.assertTrue(again["messages"][-1]["read"])

    def test_avatar_thumb(self):
        small = self.client.get("/public/people/01.jpg?s=sm")
        full = self.client.get("/public/people/01.jpg")
        self.assertEqual(small.status_code, 200)
        self.assertEqual(full.status_code, 200)
        self.assertLess(len(small.data), len(full.data))
        self.assertIn("image/jpeg", small.headers.get("Content-Type", ""))
        small.close()
        full.close()

    def test_delete_account_soft_delete_and_password(self):
        # Register a new user
        res = self.client.post(
            "/api/register",
            json={
                "email": "del-test@example.com",
                "password": "mysecretpassword",
                "name": "Игорь",
                "age_confirm": True,
                "privacy_confirm": True,
            },
        )
        self.assertEqual(res.status_code, 200)
        user = res.get_json()["user"]
        uid = user["id"]

        # Deleting without password or wrong password fails
        bad = self.client.post("/api/me/delete", json={"password": "wrong"})
        self.assertEqual(bad.status_code, 401)
        self.assertFalse(bad.get_json()["ok"])

        # Deleting with correct password succeeds
        ok = self.client.post("/api/me/delete", json={"password": "mysecretpassword"})
        self.assertEqual(ok.status_code, 200)
        self.assertTrue(ok.get_json()["ok"])

        # In the database: record MUST NEVER be deleted! Only marked with deleted_at
        from app import db
        with app.app_context():
            row = db().execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
            self.assertIsNotNone(row, "User row in database must not be deleted!")
            self.assertIsNotNone(row["deleted_at"], "deleted_at flag must be set!")
            self.assertGreater(row["deleted_at"], 0)

        # Session is dropped
        me = self.client.get("/api/me").get_json()["user"]
        self.assertIsNone(me)

        # Login is blocked
        login = self.client.post("/api/login", json={"email": "del-test@example.com", "password": "mysecretpassword"})
        self.assertEqual(login.status_code, 403)
        self.assertIn("удалён", login.get_json()["error"])

        # Excluded from people lookup
        self._register("viewer@example.com")
        p = self.client.get(f"/api/people/{uid}")
        self.assertEqual(p.status_code, 404)


if __name__ == "__main__":
    unittest.main()
