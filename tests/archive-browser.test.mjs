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
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const width of [390, 320, 1280]) for (const kind of ["pass", "snooze", "both"]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.addInitScript(() => localStorage.setItem('wiring-theme', 'slate'));
    let hidden = kind !== "pass", fail = true;
    const person = { id: 2, name: "Тестовая Анкета", age: 28, bio: "Локальный тест", photos: [], neuro: [], vibe: [] };
    const writes = [], errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let data = { ok: true };
      if (url.pathname === '/api/me') data.user = { id: 99, name: 'Дев', age: 29, theme: 'slate', plus: false, needs_profile: false, photos: [], neuro: [], vibe: [] };
      if (url.pathname === '/api/catalog') data = { ...data, neuro: [], vibe: [], intents: [], prompts: [], genders: [], looking_for: [], places: [], limits: { photos: 6 } };
      if (url.pathname === '/api/inbox') data = { ...data, unread: 0, unread_chats: 0, likes_in: 0, notices: [] };
      if (url.pathname === '/api/feed') data = { ...data, cards: hidden ? [] : [person], has_more: false, generation: 0 };
      if (url.pathname === '/api/swipe') { assert.equal(route.request().postDataJSON().direction, 'pass'); hidden = true; }
      if (url.pathname === '/api/archive') {
        if (route.request().method() === 'POST') {
          writes.push(route.request().postDataJSON());
          if (fail) { fail = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Попробуй ещё раз' }) }); }
          hidden = false;
        }
        data = { ...data, likes: [{ id: 3, name: "Лайк", age: 30 }, { id: 4, name: "Взаимный", age: 31, matched: true }], passes: hidden && kind !== "snooze" ? [person] : [], blocks: [{ id: 5, name: "Заблокированный", age: 32 }], snoozes: hidden && kind !== "pass" ? [person] : [] };
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    if (kind === 'pass') {
      await page.goto(origin + '/feed');
      await page.getByRole('button', { name: 'Скрыть — больше не показывать', exact: true }).click();
      await page.getByRole('dialog').getByText(/Вернуть её можно в архиве/).waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Исключить', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    }
    await page.goto(origin + '/archive');
    await page.locator('#archive-tab-likes').waitFor();
    assert.equal(await page.getByRole('tab').count(), 4);
    assert.deepEqual(await page.getByRole('tab').evaluateAll(tabs => tabs.map(tab => tab.id)), ['archive-tab-hidden', 'archive-tab-passes', 'archive-tab-blocks', 'archive-tab-likes']);
    assert.equal(await page.locator('#archive-tab-hidden').getAttribute('aria-selected'), 'true');
    await page.locator('#archive-tab-hidden').focus();
    await page.keyboard.press('End');
    await page.getByText('Лайк, 30', { exact: true }).waitFor();
    assert.equal(await page.getByText('Взаимный, 31', { exact: true }).count(), 0);
    await page.keyboard.press('ArrowLeft');
    await page.getByText('Заблокированный, 32', { exact: true }).waitFor();
    assert.equal(await page.getByRole('tabpanel').getByRole('link').count(), 0);
    await page.locator(kind === 'snooze' ? '#archive-tab-hidden' : '#archive-tab-passes').click();
    await page.getByRole('heading', { name: kind === 'snooze' ? 'Отложенные' : 'Дизлайки', exact: true }).waitFor();
    if (kind === 'both') {
      await page.locator('#archive-tab-hidden').click();
      await page.getByText('Тестовая Анкета, 28', { exact: true }).waitFor();
      await page.locator('#archive-tab-passes').click();
    }
    await page.getByText('Тестовая Анкета, 28', { exact: true }).waitFor();
    if (process.env.ARCHIVE_SCREENSHOT_DIR && kind === 'pass') await page.screenshot({ path: `${process.env.ARCHIVE_SCREENSHOT_DIR}/archive-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Вернуть в ленту', exact: true }).click();
    await page.getByRole('button', { name: 'отмена', exact: true }).click();
    assert.equal(writes.length, 0);
    await page.getByRole('button', { name: 'Вернуть в ленту', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Вернуть в ленту', exact: true }).click();
    await page.getByText('Попробуй ещё раз', { exact: true }).first().waitFor();
    assert.equal(hidden, true);
    await dialog.getByRole('button', { name: 'Вернуть в ленту', exact: true }).click();
    await page.getByText(kind === 'snooze' ? 'Отложенных анкет пока нет.' : 'Скрытых анкет пока нет.', { exact: true }).waitFor();
    assert.equal((await page.locator('#archive-tab-passes').textContent()).replace(/\s/g, ''), 'Дизлайки0');
    assert.equal((await page.locator('#archive-tab-hidden').textContent()).replace(/\s/g, ''), 'Отложенные0');
    assert.deepEqual(writes, [{ user_id: 2, action: kind === 'snooze' ? 'unsnooze' : 'restore' }, { user_id: 2, action: kind === 'snooze' ? 'unsnooze' : 'restore' }]);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.close();
  }
  console.log('Archive tabs: counts, separate passes/snoozes/blocks/likes, keyboard, Hide → archive, cancel, error/retry and restore passed at 320, 390 and 1280px.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
