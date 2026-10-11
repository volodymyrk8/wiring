import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Optional browser suite: use an installed Playwright, with no production API or accounts.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : "playwright");
const root = new URL("../", import.meta.url);
const fixture = `<!doctype html><html data-view="deck"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/public/styles.css"></head><body>
<div id="app"><div id="deck-feature-root"></div></div><script type="module">
import { mountDeck, mountRecommendations } from '/public/dist/deck.js';
const params = new URLSearchParams(location.search);
const recommendations = params.has('recommendations');
document.documentElement.dataset.view = recommendations ? 'recommendations' : 'deck';
const photo = color => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="'+color+'"/></svg>');
const cards = Array.from({length:5}, (_,i) => ({id:i+1,name:params.has('body')?'Тестовый профиль с длинным именем для проверки прокрутки описания':'Тест '+(i+1),age:25,photos:[photo('#9988aa'),photo('#448899')],job:params.has('body')?'Описание профессии '.repeat(10):'',bio:'Локальный тест',neuro:[],vibe:[],recommendation_reasons:['Общий интерес']}));
window.test = { state: {}, api: [], scrolls: [], resolveFeed: null };
const nativeScrollTo = Element.prototype.scrollTo;
Element.prototype.scrollTo = function(...args) {
  if (this.getAttribute('aria-label') === 'Анкеты') window.test.scrolls.push(args[0]);
  return nativeScrollTo.apply(this, args);
};
const host = {
 user:{id:99,name:'Тест',neuro:[],vibe:[],plus:true},catalog:{},cards,index:Number(params.get('index')||0),
 filters:{neuro:[],vibe:[],intents:[],min_age:18,max_age:99,city:''},filtersOpen:false,hasMore:params.has('load'),generation:0,
 basePath:'',hrefFor:()=> '#',navigate:()=>{},loadFeed:()=>new Promise(resolve=>window.test.resolveFeed=resolve),
 resetFeed:async()=>({reset:true,generation:1}),onFeedChange:(cards,index)=>window.test.state={ids:cards.map(c=>c.id),index},
 onMatch:()=>{},api:async(path,init)=>{window.test.api.push({path,body:init?.body});return {}},toast:()=>{},onUserUpdated:()=>{},onLogout:()=>{}
};
window.test.unmount = (recommendations ? mountRecommendations : mountDeck)(document.getElementById('deck-feature-root'),host);
</script></body></html>`;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(fixture); return; }
  if (!["/public/styles.css", "/public/dist/deck.js"].includes(url.pathname)) { res.writeHead(404); res.end(); return; }
  try {
    const body = await readFile(new URL(url.pathname.slice(1), root));
    res.setHeader("Content-Type", url.pathname.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8");
    res.end(body);
  } catch { res.writeHead(404); res.end("Run npm run build first"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
let passed = 0;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  const rawTouch = (type, x = 195, y = 620, points) => cdp.send("Input.dispatchTouchEvent", {
    type, touchPoints: points ?? (type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y }]),
  });
  const touch = async (type, x = 195, y = 620, points) => {
    if (type === "touchEnd" || type === "touchCancel") return rawTouch(type);
    const box = await page.locator('[aria-label="Анкеты"]').boundingBox();
    const feedY = value => box.y + value * box.height / 669;
    return rawTouch(type, x, feedY(y), points?.map(point => ({ ...point, y: feedY(point.y) })));
  };
  const state = () => page.evaluate(() => {
    const viewport = document.querySelector('[aria-label="Анкеты"]');
    return { ...window.test.state, top: viewport.scrollTop, height: viewport.clientHeight, scrolls: window.test.scrolls, api: window.test.api };
  });
  const open = async (mode, extra = "") => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/?${mode === "recommendations" ? "recommendations&" : ""}${extra}`);
    await page.waitForFunction(() => window.test?.state.index !== undefined);
    await page.waitForTimeout(250);
    await page.evaluate(() => window.test.scrolls = []);
  };
  const settled = async (index) => {
    await page.waitForTimeout(350);
    const value = await state();
    assert.equal(value.index, index);
    assert.ok(Math.abs(value.top - index * value.height) < 2, JSON.stringify(value));
    assert.equal(errors.length, 0, errors.join("\n"));
    passed++;
    return value;
  };
  for (const mode of ["deck", "recommendations"]) {
    // Actual browser touch input, including native momentum after a fast fling.
    for (let repeat = 0; repeat < 3; repeat++) {
      await open(mode); await touch("touchStart", 195, 650);
      for (const y of [560, 350, 110]) { await touch("touchMove", 195, y); await page.waitForTimeout(20); }
      await touch("touchEnd"); await page.waitForTimeout(1000); await settled(1);
    }
    await open(mode); await touch("touchStart", 195, 650);
    for (const y of [450, 200, -300, -900]) await touch("touchMove", 195, y);
    const longHeld = await state(); assert.ok(longHeld.top <= longHeld.height + 1, JSON.stringify(longHeld));
    assert.equal(longHeld.scrolls.length, 0); await touch("touchEnd"); await settled(1);
    await open(mode, "index=2"); await touch("touchStart", 195, 150);
    for (const y of [250, 400, 650]) await touch("touchMove", 195, y);
    await touch("touchEnd"); await settled(1);
    await open(mode); await touch("touchStart", 195, 620); await touch("touchMove", 195, 595);
    await touch("touchEnd"); await settled(0);

    await open(mode); await touch("touchStart", 195, 620); await touch("touchMove", 195, 520); await touch("touchEnd");
    await touch("touchStart", 195, 620); await touch("touchMove", 195, 500);
    const held = await state(); await page.waitForTimeout(200); const waiting = await state();
    assert.equal(waiting.top, held.top); assert.equal(waiting.scrolls.length, held.scrolls.length);
    await touch("touchEnd"); await settled(2);

    await open(mode); await touch("touchStart", 195, 620); await touch("touchMove", 195, 150);
    await touch("touchCancel"); await settled(0);
    await open(mode); await touch("touchStart", 195, 620); await touch("touchMove", 195, 150);
    await touch("touchStart", 0, 0, [{ x:195,y:150,id:1 }, { x:240,y:300,id:2 }]);
    await touch("touchEnd"); await settled(0);

    await open(mode); await touch("touchStart", 195, 620); await touch("touchMove", 195, 395);
    const before = await state(); await page.setViewportSize({ width:390,height:800 }); await page.waitForTimeout(150);
    const resized = await state(); assert.ok(Math.abs(resized.top - before.top) < 2);
    assert.equal(resized.scrolls.length, before.scrolls.length);
    await touch("touchEnd"); await settled(1);

    await open(mode); await touch("touchStart", 300, 250); await touch("touchMove", 220, 250); await touch("touchMove", 80, 250); await touch("touchEnd");
    await settled(0); assert.match(await page.locator('section[aria-hidden="false"] article').innerText(), /Фото 2 из 2/);
    await open(mode); await page.locator('[aria-label="Анкеты"]').focus(); await page.keyboard.press("ArrowDown"); await settled(1);
    await page.keyboard.press("ArrowUp"); await settled(0);
    await page.emulateMedia({ reducedMotion:"reduce" });
    await page.locator('[aria-label="Анкеты"]').focus();
    await page.keyboard.press("ArrowDown"); const reduced = await settled(1); assert.equal(reduced.scrolls.at(-1)?.behavior,"instant", JSON.stringify(reduced));
    await page.emulateMedia({ reducedMotion:"no-preference" });

    await open(mode); await page.getByRole('button',{name:'Лайк',exact:true}).click();
    const liked = await settled(0); assert.deepEqual(liked.ids,[2,3,4,5]);
    assert.equal(liked.api.filter(call=>call.path === '/api/swipe').length,1);
    await open(mode); const panel = await page.getByRole('button',{name:'Лайк',exact:true}).boundingBox();
    await rawTouch("touchStart",panel.x+panel.width/2,panel.y+panel.height/2);
    await rawTouch("touchMove",panel.x+panel.width/2,panel.y-100); await rawTouch("touchEnd");
    const panelSwipe = await settled(1); assert.equal(panelSwipe.api.filter(call=>call.path === '/api/swipe').length,0);

    await open(mode); await touch("touchStart",195,620); await touch("touchMove",195,400);
    await page.evaluate(()=>window.test.unmount()); await touch("touchCancel");
    await page.waitForTimeout(200); assert.equal(errors.length,0); passed++;
    console.log(`${mode}: gesture, resize, cancellation, photos, keyboard and action checks passed`);
  }
  await open("deck", "index=4&load");
  await page.waitForFunction(() => typeof window.test.resolveFeed === "function");
  await touch("touchStart",195,620); await touch("touchMove",195,395);
  const beforeAppend = await state();
  await page.evaluate(() => window.test.resolveFeed({cards:[{id:6,name:'Новая тестовая анкета',age:25}],has_more:false,generation:0}));
  await page.waitForTimeout(120); assert.equal((await state()).top,beforeAppend.top);
  await touch("touchEnd"); await settled(5);
  for (const mode of ["deck","recommendations"]) {
    await open(mode,"body"); await page.setViewportSize({width:390,height:480}); await page.waitForTimeout(150);
    const bodyBox = await page.locator('section[aria-hidden="false"] article h2').evaluate(heading => {
      const body = heading.parentElement.parentElement; window.test.body = body;
      const box = body.getBoundingClientRect(); return {x:box.x,y:box.y,width:box.width,height:box.height,max:body.scrollHeight-body.clientHeight};
    });
    assert.ok(bodyBox.max > 1, JSON.stringify(bodyBox));
    const x=bodyBox.x+bodyBox.width/2,y=bodyBox.y+bodyBox.height*.8;
    await rawTouch("touchStart",x,y); await rawTouch("touchMove",x,y-30); await page.waitForTimeout(40);
    await rawTouch("touchMove",x,y-60); await rawTouch("touchEnd");
    await settled(0); assert.ok(await page.evaluate(()=>window.test.body.scrollTop > 0));
  }
  console.log(`${passed} browser scenarios passed (Chromium mobile emulation, synthetic profiles)`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
