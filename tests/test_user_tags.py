import unittest

from user_tags import filter_hide_tags, normalize_user_tags


class UserTagsTests(unittest.TestCase):
    def test_drops_legacy_vibes(self):
        neuro, vibe = normalize_user_tags(["asd"], ["neurospicy", "nonsmalltalk", "masking"])
        self.assertEqual(neuro, ["asd"])
        self.assertEqual(vibe, ["nonsmalltalk"])

    def test_moves_neuro_stored_as_vibe(self):
        neuro, vibe = normalize_user_tags([], ["anxiety", "intherapy", "ace"])
        self.assertEqual(neuro, ["anxiety"])
        self.assertEqual(vibe, ["intherapy"])

    def test_filter_hide_tags_strips_legacy(self):
        out = filter_hide_tags(["asd", "neurospicy", "nonsmalltalk"])
        self.assertEqual(out, ["asd", "nonsmalltalk"])


if __name__ == "__main__":
    unittest.main()
