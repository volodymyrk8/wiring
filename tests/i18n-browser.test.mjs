import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const root = new URL('../', import.meta.url);
const html = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WIRING</title><link rel="stylesheet" href="/public/styles.css"></head><body><div id="app" data-base=""></div><script type="module" src="/public/dist/app.js"></script></body></html>';
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
  let language = 'en';
  let signed = true;
  const calls = [], errors = [];
  const user = { id: 99, name: 'Профиль', age: 29, city: 'Белград', gender: 'woman', looking_for: 'everyone', job: 'Психолог', bio: 'Сохранить', neuro: ['asd'], vibe: [], photos: [], prompts: [], plus: true, needs_profile: false, needs_photo_consent: false, needs_special_consent: false, jev_feed_unlocked: true, jev_feed_enabled: true, jev_feed_available: true };
  await page.addInitScript(() => {
    if (!localStorage.getItem('wiring-language')) {
      localStorage.setItem('wiring-language', 'en');
      document.cookie = 'wiring-language=en; Path=/';
    }
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const request = route.request();
    calls.push({ path: url.pathname, method: request.method(), headers: request.headers(), body: request.postData() });
    const english = request.headers()['x-wiring-language'] === 'en';
    const catalog = { neuro: [{ id: 'asd', label: english ? 'ASD' : 'РАС (ASD)', hint: english ? 'Autism spectrum' : 'Аутичный спектр' }], vibe: [], intents: [], prompts: [], genders: [{ id: 'woman', label: english ? 'woman' : 'женщина' }], looking_for: [{ id: 'everyone', label: english ? 'everyone' : 'всех' }], places: [{ country: 'Сербия', cities: ['Белград'] }], limits: { photos: 6 } };
    let data = { ok: true };
    if (url.pathname === '/api/me/language') { language = JSON.parse(request.postData()).language; data.language = language; }
    else if (url.pathname === '/api/me') data.user = signed ? { ...user, language } : null;
    else if (url.pathname === '/api/catalog') data = { ok: true, ...catalog };
    else if (url.pathname === '/api/inbox') data = { ok: true, unread: 0, unread_chats: 0, likes_in: 0, notices: [] };
    else if (url.pathname.startsWith('/api/people/')) data.person = { ...user, id: 2 };
    else if (url.pathname.startsWith('/api/messages/')) data = { ok: true, peer: { ...user, id: 2 }, messages: [{ id: 1, from_id: 2, to_id: 99, body: 'Отмена', created_at: 1720000000 }], openers: ['What music do you enjoy?'] };
    else if (url.pathname === '/api/matches') data.matches = [{ id: 2, name: 'Профиль', age: 29, last_message: 'Отмена', unread: 0 }];
    else if (url.pathname === '/api/likes') data.likes = [];
    else if (url.pathname === '/api/feed' || url.pathname === '/api/recommendations') data = { ok: true, cards: [], has_more: false, generation: 1, recommendation_source: 'local' };
    else if (url.pathname === '/api/archive') data = { ok: true, likes: [], passes: [], blocks: [] };
    else if (url.pathname === '/api/support/replies') data.replies = [];
    else if (url.pathname === '/api/auth/providers') data.providers = [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  page.on('pageerror', error => errors.push(error.message));
  const open = async path => { await page.goto(origin + path); await page.getByRole('button', { name: 'Язык / Language', exact: true }).first().waitFor(); };
  const switchTo = async label => {
    await page.getByRole('button', { name: 'Язык / Language', exact: true }).first().click();
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.getByRole('option', { name: label, exact: true }).click()]);
  };
  await open('/me');
  await page.getByRole('link', { name: 'Edit profile', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Профиль, 29', exact: true }).waitFor();
  assert.equal(await page.getByText('Сохранить', { exact: true }).count(), 1, 'member bio must stay original');
  await page.getByText('Occupation: Психолог', { exact: true }).waitFor();
  assert.ok(calls.some(call => call.path === '/api/me' && call.headers['x-wiring-language'] === 'en'));
  for (const [path, label] of [['/consents', 'Consents'], ['/notifications', 'Notifications'], ['/archive', 'Likes, passes and blocks'], ['/support', 'Support']]) {
    await open(path);
    await page.getByRole('heading', { name: label, exact: true }).first().waitFor();
  }
  await open('/me/edit');
  await page.getByRole('textbox', { name: 'Name', exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Name', exact: true }).inputValue(), 'Профиль');
  await open('/feed');
  await page.getByRole('button', { name: /^Filters/ }).first().waitFor();
  await open('/chats/2');
  await page.getByText('Отмена', { exact: true }).waitFor();
  await page.locator('textarea[name=body]').fill('Черновик: Сохранить');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ9kAAAAASUVORK5CYII=','base64');
  await page.locator('input[type=file]').setInputFiles([{name:'one.png',mimeType:'image/png',buffer:png},{name:'two.png',mimeType:'image/png',buffer:png}]);
  await page.getByRole('button', { name: 'Send together', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.dispatchEvent(new Event('wiring:before-language-change', {cancelable:true}))), false);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.waitForTimeout(400);
  await switchTo('RU');
  await page.waitForFunction(() => localStorage.getItem('wiring-language') === 'ru');
  await page.locator('textarea[name=body]').waitFor();
  assert.equal(await page.locator('textarea[name=body]').inputValue(), 'Черновик: Сохранить');
  await page.getByText('взаимная симпатия', { exact: true }).waitFor();
  await switchTo('EN');
  await page.getByText('mutual like', { exact: true }).waitFor();
  assert.equal(await page.locator('textarea[name=body]').inputValue(), 'Черновик: Сохранить');
  await open('/');
  await page.getByText('You can be yourself.', { exact: true }).waitFor();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: width > 600 ? 900 : 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`);
    await page.screenshot({ path: `/tmp/wiring-english-${width}.png`, fullPage: true });
  }
  signed = false;
  await open('/sign-in');
  await page.getByRole('textbox', { name: 'Email', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  await open('/sign-up');
  await page.getByRole('button', { name: 'Create account', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('English UI: profile, editor, feed, consents, notifications, archive, support, chat, auth, RU/EN persistence, original member text and retained chat draft passed.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
