import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const user = { id: 99, name: "Тест", age: 29, plus: true, needs_profile: false, needs_special_consent: false, photos: [] };
const messages = [
  { id: 1, from_id: 2, body: "Привет!", created_at: 1720000000, reactions: [] },
  { id: 2, from_id: 99, mine: true, body: "привет", created_at: 1720000001, reactions: [] },
];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json");
    const data = url.pathname === "/api/me" ? { user } : url.pathname === "/api/messages/2" ? { peer: { id: 2, name: "Собеседник" }, messages } : url.pathname === "/api/inbox" ? { unread: 0, likes_in: 0, notices: [] } : {};
    res.end(JSON.stringify({ ok: true, ...data }));
    return;
  }
  if (url.pathname.startsWith("/public/")) {
    try {
      const data = await readFile(new URL(url.pathname.slice(1), root));
      res.setHeader("Content-Type", url.pathname.endsWith(".css") ? "text/css" : "application/javascript");
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end();
    }
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end('<html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/styles.css"><div id="app" data-base=""></div><script type="module" src="/public/dist/app.js"></script></html>');
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : "playwright");
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y }],
  });
  const open = async () => {
    await page.goto(`${origin}/chats/2`);
    await page.locator("[data-msg='2']").waitFor();
  };
  const center = async (id) => {
    const box = await page.locator(`[data-msg="${id}"] .bubble`).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  await open();
  assert.equal(await page.getByRole("menuitem", { name: "Удалить" }).count(), 0);
  assert.equal(await page.getByRole("menuitem", { name: "Изменить" }).count(), 0);
  assert.equal(await page.getByText("Расшифровать").count(), 0);
  const replyButtons = page.getByRole("button", { name: "Ответить" });
  assert.ok(await replyButtons.count() > 0);
  for (const box of await replyButtons.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width))) {
    assert.ok(box <= 1, `reply control should be clipped until focus, width ${box}`);
  }

  const incoming = await center(1);
  await touch("touchStart", incoming.x, incoming.y);
  await touch("touchMove", incoming.x - 90, incoming.y);
  await touch("touchEnd");
  await page.waitForTimeout(200);
  assert.equal(await page.getByText("ответ на сообщение").count(), 0);

  await open();
  const own = await center(2);
  await touch("touchStart", own.x, own.y);
  for (const x of [own.x + 24, own.x + 48, own.x + 80]) await touch("touchMove", x, own.y);
  await touch("touchEnd");
  await page.getByText("ответ на сообщение").waitFor();
  assert.equal(errors.length, 0, errors.join("\n"));

  await open();
  const held = await center(2);
  await touch("touchStart", held.x, held.y);
  await page.waitForTimeout(560);
  await touch("touchEnd");
  await page.getByRole("menuitem", { name: "Изменить" }).waitFor();
  await page.getByRole("menuitem", { name: "Удалить" }).waitFor();
  await page.getByRole("menuitem", { name: "Ответить" }).click();
  await page.getByText("ответ на сообщение").waitFor();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("message actions ok");
} finally {
  await browser?.close();
  server.close();
}
