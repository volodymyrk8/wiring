import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/web-push.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { syncWebPush, pingBrowserFallback } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
function setup({ oldKey, subscription = null } = {}) {
  const calls = []; let subscribed = 0, unsubscribed = 0;
  const key = Uint8Array.from([1, 2, 3]);
  const current = subscription || (oldKey ? { endpoint: 'https://fixture/old', options: { applicationServerKey: Uint8Array.from(oldKey).buffer }, unsubscribe: async () => { unsubscribed++; }, toJSON: () => ({ endpoint: 'https://fixture/old' }) } : null);
  const registration = { pushManager: { getSubscription: async () => current, subscribe: async options => {
    subscribed++; assert.deepEqual([...new Uint8Array(options.applicationServerKey)], [...key]);
    return { toJSON: () => ({ endpoint: 'https://fixture/new' }) };
  } } };
  globalThis.window = { PushManager: {}, focus() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: {
    register: async () => ({ pushManager: { subscribe() { throw new Error('worker still installing'); } } }),
    ready: Promise.resolve(registration), getRegistration: async () => registration,
  } } });
  globalThis.Notification = class { static permission = 'granted'; constructor() { calls.push('local-notification'); } close() {} };
  window.Notification = globalThis.Notification;
  const api = async (path, init) => { calls.push([path, init]); return path.endsWith('public-key') ? { publicKey: Buffer.from(key).toString('base64url') } : {}; };
  return { api, calls, subscribed: () => subscribed, unsubscribed: () => unsubscribed };
}
test('first opt-in waits for an active worker before subscribing and saving endpoint', async () => {
  const h = setup(); assert.equal(await syncWebPush(h.api, true), 'ok'); assert.equal(h.subscribed(), 1);
  assert.equal(h.calls.at(-1)[0], '/api/push/subscribe');
});
test('changed VAPID key renews subscription; unchanged key preserves it', async () => {
  const h = setup({ oldKey: [4, 5, 6] }); await syncWebPush(h.api, true);
  assert.equal(h.unsubscribed(), 1); assert.equal(h.subscribed(), 1);
  assert.ok(h.calls.some(([path]) => path === '/api/push/unsubscribe'));
  const same = setup({ oldKey: [1, 2, 3] }); await syncWebPush(same.api, true);
  assert.equal(same.unsubscribed(), 0); assert.equal(same.subscribed(), 0);
});
test('registered web push prevents duplicate polling system notifications', async () => {
  const h = setup({ oldKey: [1, 2, 3] }); await pingBrowserFallback('hello');
  assert.deepEqual(h.calls, []);
});
test('push wakes service worker and shows notification with no open page and with a visible page', async () => {
  const script = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  for (const windows of [[], [{ visibilityState: 'hidden' }], [{ visibilityState: 'visible' }]]) {
    const handlers = {}, shown = [];
    const self = { addEventListener: (event, handler) => { handlers[event] = handler; },
      clients: { matchAll: async () => windows }, registration: { showNotification: async (...args) => shown.push(args) } };
    runInNewContext(script, { self, URL });
    let completed; handlers.push({ data: { json: () => ({ body: 'hello', url: '/chats/2' }) }, waitUntil: promise => { completed = promise; } });
    await completed; assert.equal(shown.length, 1); assert.equal(shown[0][1].data.url, '/chats/2');
  }
});
