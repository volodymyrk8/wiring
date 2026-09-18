import sqlite3
import unittest

from support_triage import create_task, ensure_task_tables, task_counts


class SupportTriageTest(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        ensure_task_tables(self.conn)

    def tearDown(self):
        self.conn.close()

    def test_scores_requests_and_filters_acknowledgements(self):
        task = create_task(
            self.conn,
            source_type="telegram",
            source_id="-100:1",
            text="Добавьте кнопку паузы в мобильной ленте, сейчас её не хватает всем пользователям",
        )
        self.assertIsNotNone(task)
        self.assertEqual(task["category"], "интерфейс")
        self.assertEqual(task["status"], "candidate")
        self.assertGreaterEqual(task["score"], task["threshold"])
        self.assertIsNone(create_task(self.conn, source_type="telegram", source_id="-100:2", text="ага"))

    def test_exact_duplicate_is_kept_out_of_queue(self):
        first = create_task(self.conn, source_type="telegram", source_id="-100:1", text="Почините вход: форма падает после отправки")
        second = create_task(self.conn, source_type="telegram", source_id="-100:2", text="Почините вход: форма падает после отправки")
        self.assertEqual(first["status"], "candidate")
        self.assertEqual(second["status"], "duplicate")
        self.assertEqual(second["duplicate_of"], first["id"])
        self.assertEqual(task_counts(self.conn)["candidate"], 1)

    def test_same_source_is_idempotent(self):
        first = create_task(self.conn, source_type="support", source_id="42", text="Хочу добавить настройку уведомлений")
        second = create_task(self.conn, source_type="support", source_id="42", text="Хочу добавить настройку уведомлений")
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM feature_tasks").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()

