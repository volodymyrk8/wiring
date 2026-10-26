"""Initial profiles are private drafts until identity is entered and published."""
from io import BytesIO
import unittest
from PIL import Image
from unittest.mock import patch
import tests.test_app as base
from app import app, db, _create_social_user, init_db


class ProfileSetupTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base.WiringTest.setUpClass()

    def setUp(self):
        base.WiringTest.setUp(self)

    def social_account(self, name=''):
        with app.app_context():
            uid = _create_social_user(db(), 'new@wiring.test', name, '')
            db().commit()
        with self.client.session_transaction() as session:
            session['uid'] = uid
        return uid

    def image(self):
        data = BytesIO()
        Image.new('RGB', (800, 800), '#57468b').save(data, 'PNG')
        data.seek(0)
        return data

    def me(self):
        return self.client.get('/api/me').get_json()['user']

    def test_social_registration_has_no_fabricated_identity(self):
        self.social_account()
        me = self.me()
        self.assertEqual(me['name'], '')
        self.assertIsNone(me['age'])
        self.assertTrue(me['needs_profile_setup'])
        self.assertTrue(me['needs_profile'])
        self.assertFalse(me['needs_photo_consent'])
        self.assertEqual(self.client.post('/api/onboard/skip').status_code, 200)
        self.assertTrue(self.me()['needs_profile'])
        for body in ({'name': 'Лена'}, {'age': 25}, {'name': 'Участник', 'age': 25}):
            self.assertEqual(self.client.patch('/api/me', json=body).status_code, 400)

    def test_image_needs_no_ownership_checkbox_and_does_not_publish(self):
        self.social_account()
        uploaded = self.client.post('/api/photos', data={'file': (self.image(), 'meme.png')}, content_type='multipart/form-data')
        self.assertEqual(uploaded.status_code, 200, uploaded.get_data(as_text=True))
        self.assertTrue(self.me()['needs_profile'])
        draft = self.client.patch('/api/me', json={'name': 'Лена', 'age': 25, 'draft': True})
        self.assertEqual(draft.status_code, 200, draft.get_data(as_text=True))
        self.assertTrue(draft.get_json()['user']['needs_profile_setup'])
        self.assertTrue(draft.get_json()['user']['needs_profile'])
        published = self.client.patch('/api/me', json={'name': 'Лена', 'age': 25})
        self.assertEqual(published.status_code, 200, published.get_data(as_text=True))
        me = published.get_json()['user']
        self.assertFalse(me['needs_profile_setup'])
        self.assertFalse(me['needs_profile'])
        self.assertEqual(me['neuro'], [])
        self.assertEqual(me['city'], '')

    def test_partial_empty_drafts_survive_without_becoming_public(self):
        self.social_account('Ада')
        draft = self.client.patch('/api/me', json={'name': '', 'age': None, 'draft': True})
        self.assertEqual(draft.status_code, 200, draft.get_data(as_text=True))
        self.assertEqual(draft.get_json()['user']['name'], '')
        self.assertIsNone(draft.get_json()['user']['age'])
        self.assertTrue(draft.get_json()['user']['needs_profile'])
        failed = self.client.patch('/api/me', json={'name': 'Ада', 'age': 25})
        self.assertEqual(failed.status_code, 400)
        self.assertTrue(self.me()['needs_profile_setup'])

    def test_legacy_placeholder_requires_setup_but_real_eighteen_is_preserved(self):
        uid = self.social_account('Участник')
        with app.app_context():
            db().execute('UPDATE users SET age = 18, profile_setup_required = 0 WHERE id = ?', (uid,))
            db().commit()
        init_db()
        self.assertEqual(self.me()['name'], '')
        self.assertIsNone(self.me()['age'])
        self.assertTrue(self.me()['needs_profile_setup'])
        self.client.post('/api/logout')
        real = base.WiringTest._register(self, email='real@wiring.test', name='Ника', age=18)
        init_db()
        self.assertEqual(real['age'], 18)
        self.assertFalse(self.me()['needs_profile'])

    def test_image_moderation_is_still_enforced(self):
        self.social_account()
        from media import MediaError
        with patch('app.moderate_photo', side_effect=MediaError('blocked')) as moderate:
            result = self.client.post('/api/photos', data={'file': (self.image(), 'meme.png')}, content_type='multipart/form-data')
        moderate.assert_called_once()
        self.assertEqual(result.status_code, 400)
        self.assertEqual(self.me()['photos'], [])
