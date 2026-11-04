import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const root = new URL('../', import.meta.url);
const user = { id: 99, name: 'Тест', age: 29, plus: true, needs_profile: false, needs_special_consent: false, photos: [], neuro: [], vibe: [], seek_min_age: 18, seek_max_age: 99, seek_place: '', hide_tags: ['adhd', 'nonsmalltalk'] };
const places = [{ country: 'Сербия', cities: ['Белград', 'Нови-Сад'] }, { country: 'Россия', cities: ['Москва'] }, { country: 'Бразилия', cities: [] }];
const cards = places.flatMap((place, index) => place.cities.map((city, i) => ({ id: index * 10 + i + 1, name: city, city, age: 28, neuro: ['asd'], photos: ['/fixture.svg'] })));
const requests = [];
const corrections = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push(url.pathname + url.search);
    if (url.pathname === '/api/me' && req.method === 'PATCH') {
      assert.deepEqual(JSON.parse(body).hide_tags, ['nonsmalltalk'], 'active vibe exclusions are retained');
      assert.equal((JSON.parse(body).hide_tags || []).includes('adhd'), false, 'diagnoses must never become visibility exclusions');
    }
    let data = {};
    if (url.pathname === '/api/places') data = { places: url.searchParams.get('q') === 'сан паулу' ? [{value: 'São Paulo · Бразилия', label: 'São Paulo · Бразилия', country: 'Бразилия'}] : [] };
    if (url.pathname === '/api/places/resolve') {
      corrections.push(JSON.parse(body));
      if (JSON.parse(body).city.startsWith('абракадабра')) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ok:false,error:'Не удалось подтвердить город. Проверь название и страну.'})); return; }
      data = { city: 'São Paulo · Бразилия', country: 'Бразилия' };
    }
    if (url.pathname === '/api/me') data = { user };
    if (url.pathname === '/api/catalog') data = { places, neuro: [{ id: 'asd', label: 'РАС' }], vibe: [{id:'nonsmalltalk',label:'Не люблю small talk'}], intents: [] };
    if (url.pathname === '/api/inbox') data = { unread: 0, notices: [] };
    if (url.pathname === '/api/feed' || url.pathname === '/api/likes') {
      const selected = cards.filter(card => (!url.searchParams.get('city') || url.searchParams.get('city') === card.city) && (!url.searchParams.get('country') || places.some(p => p.country === url.searchParams.get('country') && p.cities.includes(card.city))));
      data = url.pathname === '/api/feed' ? { cards: selected, has_more: false, generation: 0 } : { likes: selected, plus: true };
    }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, ...data })); return;
  }
  if (url.pathname === '/fixture.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="pink"/></svg>'); return; }
  if (url.pathname.startsWith('/public/')) {
    try { const data = await readFile(new URL(url.pathname.slice(1), root)); res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript'); res.end(data); }
    catch { res.statusCode = 404; res.end(); }
    return;
  }
  res.setHeader('Content-Type', 'text/html'); res.end('<html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/styles.css"><div id="app" data-base=""></div><script type="module" src="/public/dist/app.js"></script></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const choose = async (id, label) => { await page.locator('#' + id).click(); await page.getByRole('option', { name: label, exact: true }).click(); };
  await page.goto(origin + '/feed');
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  assert.equal(await page.getByText('Не показывать меня людям с этими особенностями', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Не показывать меня людям с таким вайбом', { exact: true }).count(), 1);
  await choose('deck-city', 'Москва');
  await choose('deck-country', 'Сербия');
  assert.match(await page.locator('#deck-city').innerText(), /Любой/);
  await page.locator('#deck-city').click();
  assert.equal(await page.getByRole('option', { name: 'Москва', exact: true }).count(), 0);
  await page.getByRole('option', { name: 'Нови-Сад', exact: true }).click();
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.ok(requests.some(url => { const u = new URL(url, origin); return u.pathname === '/api/feed' && u.searchParams.get('country') === 'Сербия' && u.searchParams.get('city') === 'Нови-Сад'; }));
  await page.reload();
  await page.getByRole('button', { name: 'Фильтры · применены', exact: true }).click();
  assert.match(await page.locator('#deck-country').innerText(), /Сербия/);
  assert.match(await page.locator('#deck-city').innerText(), /Нови-Сад/);
  await choose('deck-country', 'Сербия');
  assert.match(await page.locator('#deck-city').innerText(), /Нови-Сад/);
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('#deck-country').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.getByRole('option', { name: 'Сербия', exact: true }).click();
  }
  await page.screenshot({ path: '/tmp/wiring-country-filter.png', fullPage: true });
  await page.locator('#deck-seek-place').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/wiring-visibility-settings.png', fullPage: true });
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
  assert.match(await page.locator('#deck-country').innerText(), /Любая/);
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const lastFeed = new URL(requests.filter(url => url.startsWith('/api/feed?')).at(-1), origin);
  assert.equal(lastFeed.searchParams.has('country'), false); assert.equal(lastFeed.searchParams.has('city'), false);
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await choose('deck-country', 'Бразилия');
  await page.locator('#deck-city').click();
  await page.getByRole('listbox').getByRole('textbox').fill('сан паулу');
  await page.getByRole('option', { name: 'São Paulo · Бразилия', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#deck-city')?.textContent.includes('São Paulo'));
  await page.locator('#deck-city').click();
  assert.equal(await page.getByRole('listbox').getByRole('textbox').inputValue(), '', 'reopened search resets query');
  await page.getByRole('listbox').getByRole('textbox').fill('сан паулло');
  await page.getByRole('option', { name: 'Проверить «сан паулло» с ИИ', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[role="status"]'));
  assert.ok(corrections.some(item => item.city === 'сан паулло · Бразилия' && item.country === 'Бразилия'));
  assert.match(await page.locator('#deck-city').innerText(), /São Paulo/);
  await page.locator('#deck-city').click();
  await page.getByRole('listbox').getByRole('textbox').fill('абракадабра');
  await page.getByRole('option', { name: 'Проверить «абракадабра» с ИИ', exact: true }).click();
  await page.getByText('Не удалось подтвердить город. Проверь название и страну.', { exact: true }).waitFor();
  assert.match(await page.locator('#deck-city').innerText(), /São Paulo/, 'failed validation retains approved city');
  await page.locator('#deck-city').click();
  await page.getByRole('option', { name: 'Любой', exact: true }).click();
  assert.equal(await page.getByText('Не удалось подтвердить город. Проверь название и страну.', { exact: true }).count(), 0, 'a valid direct choice clears the previous validation error');
  await page.locator('#deck-city').click();
  await page.getByRole('listbox').getByRole('textbox').fill('сан паулу');
  await page.getByRole('option', { name: 'São Paulo · Бразилия', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#deck-city')?.textContent.includes('São Paulo'));

  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.ok(requests.some(url => { const u = new URL(url, origin); return u.pathname === '/api/feed' && u.searchParams.get('city') === 'São Paulo · Бразилия' && u.searchParams.get('country') === 'Бразилия'; }));
  await page.goto(origin + '/likes');
  await page.getByRole('button', { name: 'фильтры', exact: true }).click();
  await choose('likes-country', 'Россия');
  await page.getByRole('button', { name: 'применить', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#likes-country')?.textContent.includes('Россия'));
  assert.ok(requests.some(url => { const u = new URL(url, origin); return u.pathname === '/api/likes' && u.searchParams.get('country') === 'Россия'; }));
  assert.deepEqual(errors, []);
  console.log('Country filters: feed and likes queries, city narrowing/reset, retained compatible city, persistence, full reset and 320/390/1024 layout passed.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
