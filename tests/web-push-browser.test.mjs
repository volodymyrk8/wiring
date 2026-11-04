import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/sw.js' ? 'application/javascript' : 'text/html');
  res.end(req.url === '/sw.js' ? worker : '<html><title>Local push fixture</title></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext();
  await context.grantPermissions(['notifications'], { origin });
  const observer = await context.newPage();
  const cdp = await context.newCDPSession(observer);
  const registrations = new Map();
  cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations: rows }) => rows.forEach(row => registrations.set(row.scopeURL, row)));
  await cdp.send('ServiceWorker.enable');
  const page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
  const deadline = Date.now() + 5000;
  while (!registrations.get(origin + '/') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  const registration = registrations.get(origin + '/');
  assert.ok(registration, 'CDP must observe the real active worker');
  await page.close();
  assert.ok((await context.pages()).every(p => !p.url().startsWith(origin)), 'all site pages are closed');
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin, registrationId: registration.registrationId,
    data: JSON.stringify({ title: 'WIRING local test', body: 'Closed-site notification', url: '/chats/2', tag: 'closed-site-test' }),
  });
  const reopened = await context.newPage(); await reopened.goto(origin);
  await reopened.waitForFunction(async () => {
    const r = await navigator.serviceWorker.ready;
    return (await r.getNotifications({ tag: 'closed-site-test' })).length === 1;
  });
  const notification = await reopened.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    const [note] = await r.getNotifications({ tag: 'closed-site-test' });
    return { body: note.body, url: note.data.url };
  });
  assert.deepEqual(notification, { body: 'Closed-site notification', url: '/chats/2' });
  console.log('Real Chromium: with all site pages closed, injected push wakes the service worker and creates a system notification. This does not test external push providers.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
