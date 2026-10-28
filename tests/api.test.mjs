import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = (await readFile(new URL("../src/app/api.ts", import.meta.url), "utf8"))
  .replace('import { tr, getLanguage } from "@/lib/i18n";',
    'const tr = (text) => text; const getLanguage = () => "ru";');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { createApi } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

for (const headerName of ["Content-Type", "content-type", "CONTENT-TYPE"]) {
  test(`support JSON has a single content type with ${headerName}`, async (t) => {
    let request;
    t.mock.method(globalThis, "fetch", async (url, init) => {
      assert.equal(init.credentials, "same-origin");
      request = new Request(`http://localhost${url}`, init);
      return Response.json({ ok: true, notice: "отправили" });
    });
    const payload = {
      name: "Матвей", email: "test@example.com",
      body: 'Я случайно забросил пару анкет в "на неделю" нажав на иконку с часами, и не могу их вернуть в свою ленту',
    };
    const result = await createApi()("/support", {
      method: "POST",
      headers: { [headerName]: "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(request.headers.get("content-type"), "application/json");
    assert.equal(request.headers.get("accept"), "application/json");
    assert.equal(request.headers.get("x-wiring-language"), "ru");
    assert.deepEqual(await request.json(), payload);
    assert.equal(result.ok, true);
  });
}

test("API defaults to JSON and preserves an explicit non-JSON content type", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push(new Request(`http://localhost${url}`, init));
    return Response.json({ ok: true });
  });
  const api = createApi();
  await api("/support", { method: "POST", body: JSON.stringify({ body: "Помогите с анкетами" }) });
  await api("/support", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "body=test+message",
  });
  assert.equal(requests[0].headers.get("content-type"), "application/json");
  assert.equal(requests[1].headers.get("content-type"), "application/x-www-form-urlencoded");
});

test("multipart uploads keep the browser-generated boundary", async (t) => {
  let request;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    request = new Request(`http://localhost${url}`, init);
    return Response.json({ ok: true });
  });
  const form = new FormData();
  form.set("photo", new Blob(["image"]), "photo.jpg");
  await createApi()("/api/photos", { method: "POST", body: form });
  assert.match(request.headers.get("content-type"), /^multipart\/form-data; boundary=/);
  assert.equal((await request.formData()).get("photo").name, "photo.jpg");
});
