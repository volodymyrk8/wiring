import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// The real built shell with synthetic accounts and a local-only API. No DB,
// production login, provider request or production mutation is involved.
const root = new URL('../', import.meta.url);
const html = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/styles.css"></head><body><div id="app" data-base=""></div><script type="module" src="/public/dist/app.js"></script></body></html>';
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#8ca89b"/></svg>';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAB4AAAAoCAIAAABmcd1FAAAAOElEQVR4nO3MMREAMAgAMYpfLFRBRbM/M0PvPgJy6t3YkUtvWA/WYA3WYA3WYA3WYA3WYA3WYA3W8GfdGVoBxw5v36YAAAAASUVORK5CYII=', 'base64');
const user = {
  id: 99, name: 'Локальный профиль', age: 29, city: 'Белград',
  gender: 'woman', looking_for: 'everyone', bio: 'Тестовая анкета',
  neuro: ['asd'], vibe: [], intents: ['friends'], photos: ['/fixture/profile.svg'], prompts: [],
  plus: true, needs_profile: false, needs_special_consent: false,
  jev_feed_unlocked: true, jev_feed_beta: true, jev_feed_enabled: true, jev_feed_available: true,
};
const person = { ...user, bio: 'Строка один\nСтрока два', communication: 'Привет\nКак дела?', id: 2, name: 'Тестовый собеседник', neuro: ['asd', 'adhd'] };
const catalog = {
  places: [{ country: 'Сербия', cities: ['Белград'] }],
  neuro: [{ id: 'asd', label: 'РАС (ASD)' }, { id: 'adhd', label: 'СДВГ (ADHD)' }],
  vibe: [], intents: [{ id: 'friends', label: 'дружба' }], prompts: [],
  genders: [{ id: 'woman', label: 'женщина' }], looking_for: [{ id: 'everyone', label: 'всех' }], limits: { photos: 6 },
};
const calls = [];
const heldMedia = new Map();
let mediaRun = 0;
let messageCount = 100;
let sentText = '';
let delaySendRefresh = false;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/fixture/')) {
    if (url.pathname.includes('late-')) {
      if (process.env.FIXTURE_ONLY === '1') await new Promise(resolve => setTimeout(resolve, 3500));
      else await new Promise(resolve => heldMedia.set(url.pathname, resolve));
    }
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-store');
    res.end(image);
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push({ path: url.pathname, method: req.method, body });
    let data = { ok: true };
    if (url.pathname === '/api/me') {
      if (req.method === 'PATCH') Object.assign(user, JSON.parse(body));
      data.user = user;
    } else if (url.pathname === '/api/catalog') data = { ok: true, ...catalog };
    else if (url.pathname === '/api/inbox') data = { ok: true, unread: 0, unread_chats: 0, likes_in: 0, notices: [] };
    else if (url.pathname === '/api/recommendations') data = {
      ok: true, cards: [{ ...person, recommendation_reasons: [`Общие отметки о диагнозах: ${user.neuro.map(id => id === 'asd' ? 'РАС (ASD)' : 'СДВГ (ADHD)').join(', ')}`] }],
      has_more: false, generation: 0, recommendation_source: 'taste',
    };
    else if (url.pathname === '/api/messages' && req.method === 'POST') {
      sentText = JSON.parse(body).body;
      delaySendRefresh = true;
      data.id = ++messageCount;
    } else if (url.pathname === '/api/messages/2') {
      if (delaySendRefresh) {
        delaySendRefresh = false;
        await new Promise(resolve => setTimeout(resolve, 750));
      }
      const run = mediaRun || ++mediaRun;
      data = { ok: true, peer: person, messages: Array.from({ length: messageCount }, (_, i) => ({
        id: i + 1, from_id: 2, body: (i === 101 && sentText) || `Тестовое сообщение ${i + 1}`, created_at: 1720000000 + i,
        // These photos are above the last bubble and decode after the old
        // 2.5s initial pin window. The fixed-size thread itself never resizes.
        ...(i === 98 ? { photo_url: `/fixture/late-a-${run}.svg` } : {}),
        ...(i === 97 ? { photo_url: `/fixture/late-b-${run}.svg` } : {}),
      })), openers: [] };
    } else if (url.pathname === '/api/matches') data.matches = [{ ...person, unread: 0 }];
    else if (url.pathname === '/api/feed') data = { ok: true, cards: [], has_more: false, generation: 0 };
    else if (url.pathname.startsWith('/api/people/')) data.person = person;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
    return;
  }
  if (url.pathname.startsWith('/public/')) {
    try {
      res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream');
      res.end(await readFile(new URL(url.pathname.slice(1), root)));
    } catch { res.writeHead(404); res.end(); }
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
});
await new Promise(resolve => server.listen(Number(process.env.FIXTURE_PORT) || 0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
if (process.env.FIXTURE_ONLY === '1') {
  console.log(`Synthetic bug fixture: ${origin}/me/edit`);
} else {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    await page.addInitScript(() => {
      const interval = window.setInterval;
      window.setInterval = (callback, delay, ...args) => interval(callback, delay === 8000 ? 250 : delay, ...args);
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await mkdir('/tmp/wiring-trello-bugs', { recursive: true });

    await page.goto(origin + '/for-you');
    await page.getByRole('region', { name: 'Почему может подойти' }).waitFor();
    const previewBio = page.getByText('Строка один Строка два', { exact: true });
    assert.equal(await previewBio.evaluate(el => getComputedStyle(el).whiteSpace), 'pre-wrap');
    assert.match(await page.getByRole('region', { name: 'Почему может подойти' }).innerText(), /РАС/);
    await page.locator('.tabbar a[data-nav=profile]').click();
    await page.getByRole('link', { name: 'Редактировать анкету', exact: true }).click();
    await page.getByRole('button', { name: 'РАС (ASD)', exact: true }).click();
    await page.getByRole('button', { name: 'СДВГ (ADHD)', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Особенности — по желанию"] button[aria-pressed=true]')?.textContent.includes('СДВГ'));
    await new Promise(resolve => {
      const poll = setInterval(() => {
        if (calls.some(call => call.method === 'PATCH' && call.path === '/api/me' && JSON.parse(call.body).neuro?.join() === 'adhd')) { clearInterval(poll); resolve(); }
      }, 25);
      setTimeout(() => { clearInterval(poll); resolve(); }, 5000).unref();
    });
    assert.deepEqual(user.neuro, ['adhd'], 'profile autosave must reach the API before returning');
    const previousLoads = calls.filter(call => call.path === '/api/recommendations').length;
    await page.locator('.tabbar a[data-nav=recommendations]').click();
    await page.getByRole('region', { name: 'Почему может подойти' }).waitFor();
    const reasons = await page.getByRole('region', { name: 'Почему может подойти' }).innerText();
    assert.match(reasons, /СДВГ/);
    assert.doesNotMatch(reasons, /РАС/);
    assert.equal(calls.filter(call => call.path === '/api/recommendations').length, previousLoads + 1);

    await page.goto(origin + '/me/edit');
    await page.locator('input[type=file][multiple]').setInputFiles({ name: 'crop.png', mimeType: 'image/png', buffer: png });
    const dialog = page.getByRole('dialog', { name: 'Кадр', exact: true });
    await dialog.waitFor();
    await page.waitForFunction(() => !document.querySelector('[role=dialog] button:last-child')?.disabled);
    // Screen animations can establish a containing block for fixed children.
    // The crop controls must still stay in the viewport above navigation.
    await page.locator('#profile-feature-root').evaluate(el => { el.style.transform = 'translateZ(0)'; });
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 480 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(250);
      for (const name of ['Отмена', 'Готово']) {
        const bounds = await dialog.getByRole('button', { name, exact: true }).evaluate(el => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, hit: el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
        });
        assert.ok(bounds.top >= 0 && bounds.bottom <= viewport.height && bounds.hit, `${name} at ${JSON.stringify(viewport)}: ${JSON.stringify(bounds)}`);
      }
      await page.screenshot({ path: `/tmp/wiring-trello-bugs/crop-${viewport.width}x${viewport.height}.png` });
    }
    await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
    assert.equal(calls.filter(call => call.path === '/api/photos' && call.method === 'POST').length, 0);
    assert.equal(await page.getByRole('dialog').count(), 0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + '/p/2');
    const prompt = page.getByText('Привет Как дела?', { exact: true });
    assert.equal(await prompt.evaluate(el => getComputedStyle(el).whiteSpace), 'pre-wrap');
    await page.goto(origin + '/chats');
    await page.getByText('взаимно · начать разговор?', { exact: true }).waitFor();
    const chatEntry = page.getByRole('link', { name: /Тестовый собеседник/ });
    await chatEntry.click();
    await page.locator('[data-msg="100"]').waitFor();
    const thread = page.locator('.thread');
    const gap = () => thread.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop);
    await page.waitForFunction(() => { const el = document.querySelector('.thread'); return el && el.scrollTop > 100 && el.scrollHeight - el.clientHeight - el.scrollTop < 3; });
    // Wait past the original timeout, then release a photo above the last item.
    await page.waitForTimeout(2800);
    assert.ok(heldMedia.size >= 2, 'both late media requests must be pending');
    const first = [...heldMedia.keys()].find(path => path.includes('late-a-'));
    heldMedia.get(first)(); heldMedia.delete(first);
    await page.waitForFunction(() => document.querySelector('img[src*="late-a-"]')?.naturalHeight > 0);
    await page.waitForTimeout(150);
    assert.ok(await gap() < 3, 'late media must keep the newest message visible');

    await thread.hover();
    await page.mouse.wheel(0, -700);
    await page.waitForTimeout(300);
    const readingTop = await thread.evaluate(el => el.scrollTop);
    const second = [...heldMedia.keys()].find(path => path.includes('late-b-'));
    heldMedia.get(second)(); heldMedia.delete(second);
    await page.waitForFunction(() => document.querySelector('img[src*="late-b-"]')?.naturalHeight > 0);
    await page.waitForTimeout(150);
    assert.ok(Math.abs(await thread.evaluate(el => el.scrollTop) - readingTop) < 3, 'late media must not pull a history reader to the end');
    assert.ok(await gap() > 500);
    messageCount = 101;
    await page.locator('[data-msg="101"]').waitFor();
    assert.ok(Math.abs(await thread.evaluate(el => el.scrollTop) - readingTop) < 3, 'a changed poll after unchanged polls must preserve history reading');
    await page.setViewportSize({ width: 390, height: 500 });
    await page.waitForTimeout(150);
    assert.ok(Math.abs(await thread.evaluate(el => el.scrollTop) - readingTop) < 3, 'keyboard resize must preserve history reading');
    await thread.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(100);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    assert.ok(await gap() < 3, 'keyboard resize must pin a reader following the latest message');
    await thread.evaluate(el => { el.scrollTop -= 700; });
    await page.waitForFunction(() => {
      const el = document.querySelector('.thread');
      return el.scrollHeight - el.clientHeight - el.scrollTop > 500;
    });
    await page.getByPlaceholder('написать сообщение').fill('Новое сообщение из истории');
    await page.getByRole('button', { name: 'Отправить сообщение' }).click();
    await page.getByText('Новое сообщение из истории', { exact: true }).waitFor();
    assert.ok(await gap() < 3, 'sending from history returns to the newest message');
    await page.screenshot({ path: '/tmp/wiring-trello-bugs/chat-latest.png' });
    assert.deepEqual(errors, []);
    console.log('Trello regressions passed: saved diagnoses refresh recommendations; crop buttons visible at 390x844, 320x480, 844x390; line breaks, chat copy, late media, keyboard resizing and sending from history.');
  } finally {
    for (const resolve of heldMedia.values()) resolve();
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
