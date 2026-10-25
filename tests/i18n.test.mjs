import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
const root = new URL('../', import.meta.url);
const dictionary = JSON.parse(await readFile(new URL('locales/en.json', root), 'utf8'));
const normalize = text => text.replace(/\s+/g, ' ').trim();

async function sources(url) {
  const result = [];
  for (const entry of await readdir(url, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url);
    if (entry.isDirectory()) result.push(...await sources(child));
    else if (/\.[jt]sx?$/.test(entry.name)) result.push(child);
  }
  return result;
}

test('all source-authored client messages have English translations', async () => {
  for (const url of await sources(new URL('src/', root))) {
    const source = await readFile(url, 'utf8');
    const file = ts.createSourceFile(url.pathname, source, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(file) === 'tr' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const key = normalize(node.arguments[0].text);
        assert.ok(Object.hasOwn(dictionary, key), `${url.pathname}: missing ${key}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
});

test('language persistence, interpolation, failure and guest switching use the real client helper', async () => {
  const source = (await readFile(new URL('src/lib/i18n.ts', root), 'utf8')).replace(/import english from [^;]+;/, `const english = ${JSON.stringify(dictionary)};`);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  const { getLanguage, getLocale, tr, syncLanguage, selectLanguage, syncAccountLanguage } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  let reloaded = 0;
  globalThis.document = { cookie: '', documentElement: { lang: 'ru' } };
  globalThis.window = { dispatchEvent: () => true, location: { reload: () => reloaded++ } };
  assert.equal(getLanguage(), 'ru');
  assert.equal(tr('Профиль'), 'Профиль');
  syncLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(getLocale(), 'en-US');
  assert.equal(tr('Профиль'), 'Profile');
  assert.equal(tr('Лайк: {0}', 'Сохранить {0}'), 'Like: Сохранить {0}');
  assert.equal(syncLanguage('de'), false);
  assert.equal(getLanguage(), 'en');
  let request;
  globalThis.fetch = async (path, init) => { request = { path, ...init }; return { ok: false, status: 503 }; };
  await assert.rejects(selectLanguage('ru'), /Could not save your language/);
  assert.equal(getLanguage(), 'en');
  assert.equal(reloaded, 0);
  globalThis.fetch = async (path, init) => { request = { path, ...init }; return { ok: false, status: 401 }; };
  await selectLanguage('ru');
  assert.equal(reloaded, 1);
  assert.equal(getLanguage(), 'ru');
  assert.equal(request.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(request.body), { language: 'ru' });
  assert.equal(store.get('wiring-language'), 'ru');
  globalThis.fetch = async (path, init) => { request = { path, ...init }; return { ok: true, status: 200 }; };
  const account = { language: 'en' };
  await syncAccountLanguage(account);
  assert.equal(account.language, 'ru', 'the choice made before sign-in must apply to the account');
  assert.equal(store.get('wiring-language-pending'), undefined);
  window.dispatchEvent = () => false;
  await assert.rejects(selectLanguage('en'), /Заверши отправку/);
  assert.equal(getLanguage(), 'ru');
  assert.equal(reloaded, 1);

});
