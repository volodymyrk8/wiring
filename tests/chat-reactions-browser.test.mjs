import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const user = { id: 99, name: 'Тест', age: 29, plus: true, needs_profile: false, needs_special_consent: false, photos: [] };
const messages = [
  { id: 1, from_id: 2, body: 'Привет!', created_at: 1720000000, reactions: [] },
  { id: 2, from_id: 99, mine: true, photo_url: '/fixture.svg', created_at: 1720000001, reactions: [] },
  { id: 3, from_id: 2, audio_url: '/voice.webm', created_at: 1720000002, reactions: [] },
];
let fail = false;
let slow = false;
let writes = 0;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    let body = '';
    for await (const chunk of req) body += chunk;
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname.endsWith('/reaction')) {
      writes++;
      if (slow) await new Promise(resolve => setTimeout(resolve, 300));
      if (fail) { res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: 'Не удалось сохранить реакцию' })); return; }
      const message = messages.find(m => m.id === Number(url.pathname.split('/')[3]));
      const { emoji } = JSON.parse(body);
      message.reactions = emoji ? [{ emoji, count: 1, mine: true }] : [];
      res.end(JSON.stringify({ ok: true, reactions: message.reactions })); return;
    }
    const data = url.pathname === '/api/me' ? { user } : url.pathname === '/api/messages/2' ? { peer: { id: 2, name: 'Собеседник' }, messages } : url.pathname === '/api/inbox' ? { unread: 0, likes_in: 0, notices: [] } : {};
    res.end(JSON.stringify({ ok: true, ...data })); return;
  }
  if (url.pathname === '/fixture.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="pink"/></svg>'); return; }
  if (url.pathname.startsWith('/public/')) {
    try {
      const data = await readFile(new URL(url.pathname.slice(1), root));
      res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript'); res.end(data);
    } catch { res.statusCode = 404; res.end(); }
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end('<html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/styles.css"><div id="app" data-base=""></div><script type="module" src="/public/dist/app.js"></script></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin + '/chats/2');
  for (const id of [1, 2, 3]) {
    const bubble = page.locator(`[data-msg="${id}"]`);
    const pickerButton = bubble.getByRole('button', { name: 'Добавить реакцию', exact: true });
    assert.equal(await pickerButton.textContent(), '');
    assert.equal(await pickerButton.locator('svg[aria-hidden="true"]').count(), 1);
    await pickerButton.click();
    await bubble.getByRole('button', { name: 'Реакция ❤️', exact: true }).click();
    await bubble.getByRole('group', { name: 'Реакции', exact: true }).waitFor({ state: 'hidden' });
    const reaction = bubble.getByRole('button', { name: 'Реакция ❤️', exact: true });
    await reaction.waitFor();
    assert.equal(await reaction.textContent(), '❤️');
  }
  const bubble = page.locator('[data-msg="1"]');
  await bubble.getByRole('button', { name: 'Добавить реакцию', exact: true }).click();
  await bubble.getByRole('button', { name: 'Реакция 🎉', exact: true }).click();
  await bubble.getByRole('group', { name: 'Реакции', exact: true }).waitFor({ state: 'hidden' });
  await bubble.getByRole('button', { name: 'Реакция 🎉', exact: true }).waitFor();
  assert.equal(await bubble.getByRole('button', { name: 'Реакция ❤️', exact: true }).count(), 0);
  await page.reload();
  await bubble.getByRole('button', { name: 'Реакция 🎉', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-msg="1"] [aria-pressed="true"]'));
  fail = true;
  await bubble.getByRole('button', { name: 'Добавить реакцию', exact: true }).click();
  await bubble.getByRole('button', { name: 'Реакция 👍', exact: true }).click();
  await page.getByText('Не удалось сохранить реакцию', { exact: true }).waitFor();
  assert.deepEqual(messages[0].reactions, []);
  fail = false; slow = true;
  const before = writes;
  await bubble.getByRole('button', { name: 'Реакция 👍', exact: true }).evaluate(button => { button.click(); button.click(); });
  await bubble.getByRole('group', { name: 'Реакции', exact: true }).waitFor({ state: 'hidden' });
  await bubble.getByRole('button', { name: 'Реакция 👍', exact: true }).waitFor();
  assert.equal(writes, before + 1, 'duplicate clicks must issue one mutation');
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await bubble.getByRole('button', { name: 'Добавить реакцию', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.screenshot({ path: `/tmp/wiring-chat-reactions-${width}.png`, fullPage: true });
    await bubble.getByRole('button', { name: 'Добавить реакцию', exact: true }).click();
  }
  await page.screenshot({ path: '/tmp/wiring-chat-reactions.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Chat reactions: text/photo/voice, replace, remove, reload, failure, duplicate clicks, mobile/desktop layout passed.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
