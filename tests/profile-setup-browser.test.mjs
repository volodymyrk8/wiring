import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const root = new URL('../', import.meta.url);
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/styles.css"></head><body><div id="app" data-base=""></div><script type="module" src="/public/dist/app.js"></script></body></html>';
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/public/')) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
  if (url.pathname.includes('..')) { res.writeHead(404); res.end(); return; }
  try { res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(await readFile(new URL(url.pathname.slice(1), root))); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const errors = [], saves = [], uploads = [];
  let user = { id: 991, name: '', age: null, city: '', gender: 'other', looking_for: 'everyone', neuro: [], vibe: [], prompts: [], photos: [], needs_profile: true, needs_profile_setup: true, needs_photo_consent: false, needs_special_consent: true, language: 'ru' };
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let data = { ok: true };
    if (url.pathname === '/api/me') {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON(); saves.push(body);
        user = { ...user, ...body, ...(body.draft ? {} : { needs_profile: false, needs_profile_setup: false }) };
      }
      data.user = user;
    } else if (url.pathname === '/api/catalog') data = { ok: true, neuro: [], vibe: [], intents: [], prompts: [], places: [], genders: [], looking_for: [], limits: { photos: 6 } };
    else if (url.pathname === '/api/photos') {
      uploads.push(route.request().postDataBuffer().toString());
      const photo = { id: 77, url: '/public/icon-512.png', is_primary: true };
      user = { ...user, photos: [photo], photo: photo.url }; data.photo = photo;
    } else if (url.pathname === '/api/inbox') data = { ok: true, unread: 0, unread_chats: 0, likes_in: 0, notices: [] };
    else if (url.pathname === '/api/feed') data = { ok: true, cards: [], has_more: false };
    else if (url.pathname === '/api/auth/providers') data.providers = [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto(origin + '/feed');
  await page.getByRole('heading', { name: 'Заверши анкету', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Имя', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('Возраст', { exact: true }).inputValue(), '');
  assert.equal(await page.getByRole('checkbox', { name: /свои фото/ }).count(), 0);
  await page.getByLabel('Имя', { exact: true }).fill('Лена');
  await page.getByLabel('Возраст', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Опубликовать анкету', exact: true }).click();
  await page.getByText('Нужно хотя бы одно фото', { exact: true }).waitFor();
  assert.equal(saves.filter(s => s.draft === false).length, 0);
  await page.locator('input[type=file]').first().setInputFiles(new URL('../public/icon-512.png', import.meta.url).pathname);
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
  await page.waitForFunction(() => [...document.images].some(i => i.src.includes('icon-512.png')));
  assert.equal(uploads.length, 1);
  assert.ok(!uploads[0].includes('photo_rights_consent'));
  assert.equal(user.needs_profile_setup, true, 'image upload and autosave must leave the profile unpublished');
  await page.screenshot({ path: '/tmp/wiring-profile-setup.png', fullPage: true });
  await page.getByRole('button', { name: 'Опубликовать анкету', exact: true }).click();
  await page.getByRole('heading', { name: 'Заверши анкету', exact: true }).waitFor({ state: 'detached' });
  assert.equal(user.needs_profile_setup, false);
  assert.equal(user.name, 'Лена');
  assert.equal(user.age, 25);
  assert.equal(saves.filter(s => s.draft === false).length, 1);
  assert.deepEqual(errors, []);
  console.log('profile setup: blank identity, route guard, image without ownership checkbox, draft, explicit publication passed');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
