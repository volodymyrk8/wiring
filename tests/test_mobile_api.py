import os
import unittest
from unittest.mock import MagicMock, patch

import tests.test_app as base  # sets the test environment
from tests.test_app import app  # noqa: E402
from database import open_request_connection, table_names  # noqa: E402
import mobile_api  # noqa: E402


class MobileApiTest(unittest.TestCase):
    _register = base.WiringTest._register
    _logout = base.WiringTest._logout

    @classmethod
    def setUpClass(cls):
        base.WiringTest.setUpClass()

    def setUp(self):
        base.WiringTest.setUp(self)
        self.web = app.test_client()
        self.mobile = app.test_client(use_cookies=False)

    def tearDown(self):
        os.environ.pop("MOBILE_MIN_VERSION", None)

    def _user(self, email="mob@example.com", **extra):
        self.client = self.web
        user = self._register(email=email, **extra)
        self.web.post("/api/logout")
        return user

    def _token_login(self, email="mob@example.com", password="secret1"):
        res = self.mobile.post("/api/auth/token", json={"email": email, "password": password, "device": "test"})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        return res.get_json()

    def _bearer(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_token_login_returns_pair_and_user(self):
        self._user()
        data = self._token_login()
        self.assertTrue(data["access_token"] and data["refresh_token"])
        self.assertEqual(data["user"]["email"], "mob@example.com")

    def test_bad_password_rejected(self):
        self._user()
        res = self.mobile.post("/api/auth/token", json={"email": "mob@example.com", "password": "nope"})
        self.assertEqual(res.status_code, 401)

    def test_bearer_authenticates_existing_endpoints_without_cookie(self):
        self._user()
        tokens = self._token_login()
        res = self.mobile.get("/api/me", headers=self._bearer(tokens["access_token"]))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["user"]["email"], "mob@example.com")
        self.assertNotIn("Set-Cookie", res.headers)
        feed = self.mobile.get("/api/feed", headers=self._bearer(tokens["access_token"]))
        self.assertEqual(feed.status_code, 200)

    def test_no_token_still_needs_session(self):
        self.assertEqual(self.mobile.get("/api/feed").status_code, 401)

    def test_garbage_bearer_is_401_with_token_expired_flag(self):
        res = self.mobile.get("/api/me", headers=self._bearer("garbage"))
        self.assertEqual(res.status_code, 401)
        self.assertTrue(res.get_json()["token_expired"])

    def test_refresh_rotates_and_replay_revokes_family(self):
        self._user()
        first = self._token_login()
        second = self.mobile.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
        self.assertEqual(second.status_code, 200)
        second = second.get_json()
        self.assertNotEqual(second["refresh_token"], first["refresh_token"])
        replay = self.mobile.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
        self.assertEqual(replay.status_code, 401)
        # the rotated token from the same family is now dead too
        dead = self.mobile.post("/api/auth/refresh", json={"refresh_token": second["refresh_token"]})
        self.assertEqual(dead.status_code, 401)

    def test_refresh_ignores_stale_bearer_header(self):
        self._user()
        tokens = self._token_login()
        res = self.mobile.post(
            "/api/auth/refresh",
            json={"refresh_token": tokens["refresh_token"]},
            headers=self._bearer("stale-token"),
        )
        self.assertEqual(res.status_code, 200)

    def test_logout_revokes_refresh(self):
        self._user()
        tokens = self._token_login()
        out = self.mobile.post("/api/auth/logout", json={"refresh_token": tokens["refresh_token"]})
        self.assertEqual(out.status_code, 200)
        again = self.mobile.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        self.assertEqual(again.status_code, 401)

    def test_password_change_invalidates_tokens(self):
        from werkzeug.security import generate_password_hash

        user = self._user()
        tokens = self._token_login()
        conn = open_request_connection()
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (generate_password_hash("another1", method="pbkdf2:sha256"), user["id"]),
        )
        conn.commit()
        conn.close()
        res = self.mobile.get("/api/me", headers=self._bearer(tokens["access_token"]))
        self.assertEqual(res.status_code, 401)
        refresh = self.mobile.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        self.assertEqual(refresh.status_code, 401)

    def test_deleted_account_cannot_use_token(self):
        user = self._user()
        tokens = self._token_login()
        conn = open_request_connection()
        conn.execute("UPDATE users SET deleted_at = 1 WHERE id = ?", (user["id"],))
        conn.commit()
        conn.close()
        res = self.mobile.get("/api/me", headers=self._bearer(tokens["access_token"]))
        self.assertEqual(res.status_code, 401)

    def test_min_version_gate(self):
        os.environ["MOBILE_MIN_VERSION"] = "1.2.0"
        old = self.mobile.get("/api/catalog", headers={"X-App-Version": "1.1.9"})
        self.assertEqual(old.status_code, 426)
        self.assertTrue(old.get_json()["upgrade"])
        ok = self.mobile.get("/api/catalog", headers={"X-App-Version": "1.2.0"})
        self.assertEqual(ok.status_code, 200)
        web = self.mobile.get("/api/catalog")
        self.assertEqual(web.status_code, 200)
        cfg = self.mobile.get("/api/app-config").get_json()
        self.assertEqual(cfg["min_version"], "1.2.0")

    def test_version_compare(self):
        self.assertTrue(mobile_api.version_too_old("1.9", "1.10"))
        self.assertFalse(mobile_api.version_too_old("2.0.0", "1.10"))
        self.assertFalse(mobile_api.version_too_old("1.0.0", "1.0"))

    def test_device_registration_validates_token_and_platform(self):
        self._user()
        tokens = self._token_login()
        h = self._bearer(tokens["access_token"])
        bad = self.mobile.post("/api/push/device", json={"token": "abc", "platform": "ios"}, headers=h)
        self.assertEqual(bad.status_code, 400)
        bad = self.mobile.post(
            "/api/push/device", json={"token": "ExponentPushToken[abcdefgh12345]", "platform": "web"}, headers=h
        )
        self.assertEqual(bad.status_code, 400)
        ok = self.mobile.post(
            "/api/push/device", json={"token": "ExponentPushToken[abcdefgh12345]", "platform": "ios"}, headers=h
        )
        self.assertEqual(ok.status_code, 200, ok.get_data(as_text=True))
        conn = open_request_connection()
        n = conn.execute("SELECT COUNT(*) AS n FROM mobile_devices").fetchone()["n"]
        conn.close()
        self.assertEqual(n, 1)
        gone = self.mobile.delete("/api/push/device", json={"token": "ExponentPushToken[abcdefgh12345]"}, headers=h)
        self.assertEqual(gone.status_code, 200)

    def test_device_registration_requires_session(self):
        res = self.mobile.post(
            "/api/push/device", json={"token": "ExponentPushToken[abcdefgh12345]", "platform": "ios"}
        )
        self.assertEqual(res.status_code, 401)

    def test_device_registration_respects_notification_opt_out(self):
        self._user()
        tokens = self._token_login()
        h = self._bearer(tokens["access_token"])
        self.mobile.patch("/api/notifications", json={"push": False}, headers=h)
        res = self.mobile.post(
            "/api/push/device", json={"token": "ExponentPushToken[abcdefgh12345]", "platform": "android"}, headers=h
        )
        self.assertEqual(res.status_code, 403)

    def _seed_device(self, user_id, token="ExponentPushToken[abcdefgh12345]"):
        conn = open_request_connection()
        conn.execute(
            "INSERT INTO mobile_devices (token, user_id, platform, created_at, updated_at) VALUES (?, ?, 'ios', 1, 1)",
            (token, user_id),
        )
        conn.commit()
        return conn

    def test_send_device_push_posts_to_expo_and_prunes_dead_tokens(self):
        user = self._user()
        conn = self._seed_device(user["id"])
        response = MagicMock()
        response.read.return_value = (
            b'{"data":[{"status":"error","details":{"error":"DeviceNotRegistered"}}]}'
        )
        response.__enter__.return_value = response
        with patch("mobile_api.urllib.request.urlopen", return_value=response) as opened:
            mobile_api.send_device_push(conn, user["id"], body="привет", url="/chats/2", tag="message-2")
        req = opened.call_args[0][0]
        self.assertEqual(req.full_url, mobile_api.EXPO_PUSH_URL)
        self.assertIn(b"/chats/2", req.data)
        left = conn.execute("SELECT COUNT(*) AS n FROM mobile_devices").fetchone()["n"]
        conn.close()
        self.assertEqual(left, 0)

    def test_send_device_push_survives_network_failure(self):
        user = self._user()
        conn = self._seed_device(user["id"])
        with patch("mobile_api.urllib.request.urlopen", side_effect=OSError("down")):
            mobile_api.send_device_push(conn, user["id"], body="x", url="/", tag="t")
        left = conn.execute("SELECT COUNT(*) AS n FROM mobile_devices").fetchone()["n"]
        conn.close()
        self.assertEqual(left, 1)

    def test_message_pagination(self):
        self.client = self.web
        a = self._register(email="a@example.com", name="Аня")
        self._logout()
        b = self._register(email="b@example.com", name="Боря")
        self.assertEqual(self.web.post("/api/swipe", json={"target_id": a["id"], "direction": "like"}).status_code, 200)
        self._logout()
        self._login = base.WiringTest._login.__get__(self)
        self._login("a@example.com")
        res = self.web.post("/api/swipe", json={"target_id": b["id"], "direction": "like"})
        self.assertTrue(res.get_json()["matched"])
        for i in range(7):
            self.assertEqual(self.web.post("/api/messages", json={"to_id": b["id"], "body": f"m{i}"}).status_code, 200)
        full = self.web.get(f"/api/messages/{b['id']}").get_json()
        self.assertEqual(len(full["messages"]), 7)
        self.assertFalse(full["has_more"])
        ids = [m["id"] for m in full["messages"]]

        latest = self.web.get(f"/api/messages/{b['id']}?limit=3").get_json()
        self.assertEqual([m["id"] for m in latest["messages"]], ids[-3:])
        self.assertTrue(latest["has_more"])

        older = self.web.get(f"/api/messages/{b['id']}?limit=3&before={ids[-3]}").get_json()
        self.assertEqual([m["id"] for m in older["messages"]], ids[1:4])
        self.assertTrue(older["has_more"])

        newer = self.web.get(f"/api/messages/{b['id']}?after={ids[3]}").get_json()
        self.assertEqual([m["id"] for m in newer["messages"]], ids[4:])
        self.assertFalse(newer["has_more"])

    def test_message_client_id_makes_retries_idempotent(self):
        self.client = self.web
        a = self._register(email="a2@example.com", name="Аня")
        self._logout()
        b = self._register(email="b2@example.com", name="Боря")
        self.web.post("/api/swipe", json={"target_id": a["id"], "direction": "like"})
        self._logout()
        base.WiringTest._login.__get__(self)("a2@example.com")
        self.assertTrue(self.web.post("/api/swipe", json={"target_id": b["id"], "direction": "like"}).get_json()["matched"])
        payload = {"to_id": b["id"], "body": "привет", "client_id": "cid-1"}
        first = self.web.post("/api/messages", json=payload).get_json()
        again = self.web.post("/api/messages", json=payload).get_json()
        self.assertTrue(first["ok"] and not first.get("duplicate"))
        self.assertTrue(again["ok"] and again["duplicate"])
        self.assertEqual(first["id"], again["id"])
        other = self.web.post("/api/messages", json={**payload, "client_id": "cid-2"}).get_json()
        self.assertNotEqual(other["id"], first["id"])
        thread = self.web.get(f"/api/messages/{b['id']}").get_json()
        self.assertEqual(len(thread["messages"]), 2)
        # no client_id keeps the old behaviour: every send is a new message
        self.web.post("/api/messages", json={"to_id": b["id"], "body": "без id"})
        self.web.post("/api/messages", json={"to_id": b["id"], "body": "без id"})
        self.assertEqual(len(self.web.get(f"/api/messages/{b['id']}").get_json()["messages"]), 4)

    def test_notification_switches_do_not_flip_each_other(self):
        self._user()
        tokens = self._token_login()
        h = self._bearer(tokens["access_token"])

        def patch(body):
            res = self.mobile.patch("/api/notifications", json=body, headers=h)
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            user = res.get_json()["user"]
            return user["notify_enabled"], user["notify_push"]

        self.assertEqual(patch({"enabled": False}), (False, False))
        # changing only push must not switch notifications back on
        self.assertEqual(patch({"push": True}), (False, False))
        self.assertEqual(patch({"enabled": True}), (True, False))  # push stays off
        self.assertEqual(patch({"push": True}), (True, True))
        self.assertEqual(patch({"push": False}), (True, False))
        self.assertEqual(patch({"enabled": False}), (False, False))
        self.assertEqual(patch({"enabled": True, "push": True}), (True, True))


if __name__ == "__main__":
    unittest.main()
