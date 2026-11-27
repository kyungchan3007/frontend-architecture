import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { BASE, getJson } from "./helpers.mjs";

const enc = encodeURIComponent;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser.close(); });

test("꺼짐: /api/diag/explain은 404 (GET, POST)", async () => {
  assert.equal((await fetch(BASE + "/api/diag/explain")).status, 404);
  const r = await fetch(BASE + "/api/diag/explain", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "x" }),
  });
  assert.equal(r.status, 404);
  assert.equal((await fetch(BASE + "/api/diag/other")).status, 404);
});

test("꺼짐: 자동완성 응답에 _diag 없음", async () => {
  const { body } = await getJson(`/api/autocomplete?q=${enc("한국")}`);
  assert.deepEqual(Object.keys(body).sort(), ["items", "query"]);
  assert.ok(!JSON.stringify(body).includes("_diag"));
});

test("꺼짐: HTML에 패널이 없음", async () => {
  const { body } = await getJson(`/api/search?q=${enc("연구")}&sort=popular`);
  const id = body.items[0].id;
  for (const path of ["/", `/search?q=${enc("연구")}`, `/books/${id}`]) {
    const html = await (await fetch(BASE + path)).text();
    assert.ok(!html.includes("diag-panel"), path);
    assert.ok(!html.includes("DiagPanel"), path);
    assert.ok(!/diag/i.test(html.replace(/data-testid="[^"]*"/g, "")) || !html.includes("diag:start"), path);
  }
});

test("꺼짐: 흐름 전체에서 진단 chunk를 내려받지 않음", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const scripts = [];
  page.on("response", async (r) => {
    if (r.url().endsWith(".js") || r.url().includes(".js?")) scripts.push(r.text().then((t) => ({ url: r.url(), t })).catch(() => null));
  });
  await page.goto(BASE + "/");
  const input = page.locator('[data-testid="search-input"]');
  await input.click();
  await input.pressSequentially("파이썬", { delay: 30 });
  await page.locator('[data-testid="autocomplete-list"][data-query="파이썬"]').waitFor();
  await input.press("Enter");
  await page.locator('[data-testid="result-item"]').first().click();
  await page.locator('[data-testid="book-title"]').waitFor();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator('[data-testid="diag-panel"]').count(), 0);
  const loaded = (await Promise.all(scripts)).filter(Boolean);
  assert.ok(loaded.length > 0);
  for (const s of loaded) {
    assert.ok(!s.t.includes("diag-panel") && !s.t.includes("diag:start") && !s.t.includes("api/diag"), s.url);
  }
  await context.close();
});
