import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const root = new URL('../', import.meta.url);
// Render the real template with synthetic data, without importing the app or opening a database.
const fixture = execFileSync(new URL('../.venv/bin/python', import.meta.url).pathname, ['-c', `
import re
from collections import defaultdict
from jinja2 import Environment, FileSystemLoader
env = Environment(loader=FileSystemLoader('templates'), autoescape=True)
from i18n import tr
env.globals.update(_=tr, language='ru')
stats = defaultdict(int)
for key in re.findall(r'for \\w+ in s\\.(\\w+)', open('templates/admin.html').read()):
    stats[key] = []
stats['users_real'] = 128
stats['report_banned'] = 2
print(env.get_template('admin.html').render(
    authed=True, s=stats, codes=[], tasks=[], task_counts={'candidate': 3},
    task_threshold=7, reply_history={'ticket': {}, 'report': {}},
    reply_nonce=lambda: 'fixture-request-id', reply_csrf='fixture-csrf',
    tickets=[{'id': 1, 'name': 'Test person', 'email': 'local@wiring.test',
              'body': 'A synthetic support ticket', 'user_id': 1}],
))
`], { cwd: root, encoding: 'utf8' });
const assets = ['/public/styles.css', '/public/dist/server-header.js'];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/admin/premium' && req.method === 'POST') {
    res.writeHead(302, { Location: '/admin' });
    res.end();
    return;
  }
  if (url.pathname === '/admin') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fixture);
    return;
  }
  if (!assets.includes(url.pathname)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css');
  res.end(await readFile(new URL(url.pathname.slice(1), root)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const open = async (hash = '') => {
    await page.goto(`${origin}/admin${hash}`);
    await page.getByRole('tab').first().waitFor();
  };
  const selected = id => page.locator(`#admin-tab-${id}`);
  const checkPanel = async id => {
    await assert.doesNotReject(() => page.waitForFunction(id => {
      const visible = [...document.querySelectorAll('[data-admin-panel]')].filter(el => !el.hidden);
      return visible.length === 1 && visible[0].id === id;
    }, id));
    assert.equal(await selected(id).getAttribute('aria-selected'), 'true');
  };
  await open();
  assert.equal(await page.getByRole('tab').count(), 8);
  assert.equal(await page.locator('[data-admin-tabs] a').count(), 8);
  await checkPanel('overview');
  if (process.env.ADMIN_SCREENSHOT) await page.screenshot({ path: process.env.ADMIN_SCREENSHOT.replace(/\.png$/, '-desktop.png'), fullPage: true });
  await selected('support').click();
  await checkPanel('support');
  await page.locator('textarea[name="body"]').fill('Keep this draft');
  assert.match(await page.locator('#support form').getAttribute('action'), /#support$/);
  await selected('tasks').click();
  await page.goBack();
  await checkPanel('support');
  assert.equal(await page.locator('textarea[name="body"]').inputValue(), 'Keep this draft');
  await page.goForward();
  await checkPanel('tasks');
  await page.reload();
  await checkPanel('tasks');
  await selected('tasks').focus();
  await page.keyboard.press('ArrowRight');
  await checkPanel('marketing');
  await page.keyboard.press('Home');
  await checkPanel('overview');
  for (const hash of ['#reports', '#bans']) {
    await open(hash);
    await checkPanel('moderation');
    assert.equal(await page.locator(hash).isVisible(), true);
  }
  await open('#premium');
  assert.match(await page.locator('form[action^="/admin/premium"]').last().getAttribute('action'), /#premium$/);
  await page.locator('#premium input[name="who"]').fill('synthetic@wiring.test');
  await Promise.all([
    page.waitForURL(`${origin}/admin#premium`),
    page.locator('#premium form[action^="/admin/premium"] button').click(),
  ]);
  await page.getByRole('tab').first().waitFor();
  await checkPanel('premium');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['overview', 'people', 'analytics', 'premium', 'moderation', 'support', 'tasks', 'marketing']) {
    await selected(id).click();
    await checkPanel(id);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${id} overflows mobile viewport`);
  }
  await selected('support').click();
  const table = page.locator('#support [role="region"]');
  assert.equal(await table.evaluate(el => el.scrollWidth > el.clientWidth), true);
  if (process.env.ADMIN_SCREENSHOT) await page.screenshot({ path: process.env.ADMIN_SCREENSHOT, fullPage: true });
  assert.deepEqual(errors, []);
  const plain = await browser.newPage({ javaScriptEnabled: false });
  await plain.goto(`${origin}/admin#support`);
  assert.equal(await plain.locator('[data-admin-panel]:visible').count(), 8);
  console.log('Admin tabs: history, deep links, keyboard, drafts, mobile layout and no-JS fallback passed.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
