import unittest
from unittest.mock import patch
import notify


class ModeratorMailTest(unittest.TestCase):
    def test_support_inbox_is_the_only_moderator_mail_recipient(self):
        with patch.dict('os.environ', {'SUPPORT_INBOX': 'moderators@wiring.test'}), patch('notify._send_email', return_value=True) as mail, patch('notify._admin_telegram'):
            self.assertTrue(notify.notify_support('Новая жалоба', 'Проверь очередь админки'))
            mail.assert_called_once_with('moderators@wiring.test', 'Новая жалоба', 'Проверь очередь админки')

    def test_absent_mailbox_or_failed_transport_is_not_claimed_as_sent(self):
        with patch.dict('os.environ', {'SUPPORT_INBOX': ''}), patch('notify._send_email') as mail, patch('notify._admin_telegram'):
            self.assertFalse(notify.notify_support('Новая жалоба', 'Очередь'))
            mail.assert_not_called()
        with patch.dict('os.environ', {'SUPPORT_INBOX': 'moderators@wiring.test'}), patch('notify._send_email', return_value=False), patch('notify._admin_telegram'):
            self.assertFalse(notify.notify_support('Новая жалоба', 'Очередь'))
