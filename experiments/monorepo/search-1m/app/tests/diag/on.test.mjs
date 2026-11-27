import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { BASE, getJson, newPool } from "../helpers.mjs";

const enc = encodeURIComponent;
let browser;
const pool = newPool();
before(async () => {
  const r = await fetch(BASE + "/api/diag/explain", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "nope" }),
  });
  assert.equal(r.status, 400, "DIAG_ENABLED=1 로 실행 중이어야 함");
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser.close(); await pool.end(); });

const explain = (body) =>
  fetch(BASE + "/api/diag/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function openPanel(page) {
  const body = page.locator(".diag-body");
  if (await body.isHidden()) await page.locator('[data-testid="diag-toggle"]').click();
}

test("켜짐: 자동완성 응답에 _diag", async () => {
  const { body } = await getJson(`/api/autocomplete?q=${enc("한국")}`);
  assert.ok(body._diag);
  assert.equal(typeof body._diag.serverMs, "number");
  assert.deepEqual(body._diag.queries.map((q) => q.label), ["제목 후보", "저자 후보"]);
  for (const q of body._diag.queries) for (const k of ["token", "waitMs", "execMs", "rows"]) assert.ok(k in q);
  assert.ok(!JSON.stringify(body._diag).includes("SELECT"), "SQL을 클라이언트로 보내지 않음");
});

test("켜짐: 임의 토큰, 임의 SQL 거부", async () => {
  const before = (await pool.query("SELECT COUNT(*) FROM books")).rows[0].count;
  for (const body of [
    { token: "x" }, { token: "'; DROP TABLE books; --" }, { token: "../../etc/passwd" }, {}, { token: 1 },
    { sql: "DROP TABLE books" }, { token: "x", sql: "DELETE FROM reviews" }, { token: { $ne: 1 } },
  ]) {
    const r = await explain(body);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal((await explain("not json")).status, 400);
  assert.equal((await pool.query("SELECT COUNT(*) FROM books")).rows[0].count, before);
});

test("켜짐: 홈 자동완성 패널과 요청 수", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(BASE + "/");
  await page.locator('[data-testid="diag-panel"]').waitFor();
  const input = page.locator('[data-testid="search-input"]');
  await input.click();
  await input.pressSequentially("파이", { delay: 80 });
  await page.locator('[data-testid="autocomplete-list"][data-query="파이"]').waitFor();
  await openPanel(page);
  const ac = page.locator('[data-testid="diag-autocomplete"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="diag-autocomplete"]')?.textContent.includes("'파이'"));
  const text = await ac.textContent();
  assert.match(text, /요청 2건/);
  assert.match(text, /서버 [\d.]+ms/);
  assert.equal(await page.locator('[data-testid="diag-ac-query"]').count(), 2);
  assert.match(await page.locator('[data-testid="diag-criteria"]').textContent(), /100ms/);
  assert.match(await page.locator('[data-testid="diag-cause"]').textContent(), /추정/);
  await context.close();
});

test("켜짐: 검색 후 패널에 COUNT, 목록 쿼리와 실행 계획", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(BASE + "/");
  const input = page.locator('[data-testid="search-input"]');
  await input.click();
  await input.pressSequentially("연구", { delay: 50 });
  await page.locator('[data-testid="autocomplete-list"][data-query="연구"]').waitFor();
  await input.press("Enter");
  await page.locator('[data-testid="search-results"][data-query="연구"]').waitFor();
  await page.locator('[data-testid="diag-panel"]').waitFor();
  await openPanel(page);
  const labels = await page.locator('[data-testid="diag-query"]').evaluateAll((els) => els.map((e) => e.dataset.label));
  assert.deepEqual([...labels].sort(), ["COUNT", "목록", "저자"].sort());
  await page.waitForFunction(() => !document.querySelector('[data-testid="diag-total"]').textContent.includes("측정 중"));
  const total = await page.locator('[data-testid="diag-total"]').textContent();
  assert.match(total, /^[\d.]+ms/, total);
  const seg = await page.locator('[data-testid="diag-segments"]').textContent();
  assert.match(seg, /서버 [\d.]+ms/);
  console.log("search total/segments:", total, "|", seg);
  assert.match(await page.locator('[data-testid="diag-size"]').textContent(), /전송/);
  assert.match(await page.locator('[data-testid="diag-criteria"]').textContent(), /500ms · (기준 이내|기준 초과)/);
  assert.match(await page.locator('[data-testid="diag-panel"]').textContent(), /쿼리를 한 번 더 실행하므로 시간이 듭니다/);

  const countRow = page.locator('[data-testid="diag-query"][data-label="COUNT"]');
  await countRow.locator('[data-testid="diag-explain-btn"]').click();
  const res = countRow.locator('[data-testid="diag-explain-result"]');
  await res.waitFor();
  const rt = await res.textContent();
  assert.match(rt, /스캔 방식: .*Scan/);
  assert.match(rt, /읽은 행 [\d,]+ \/ 반환 [\d,]+/);
  assert.match(rt, /shared hit/);
  assert.match(rt, /shared read/);
  console.log("COUNT explain:", rt);
  const listRow = page.locator('[data-testid="diag-query"][data-label="목록"]');
  await listRow.locator('[data-testid="diag-explain-btn"]').click();
  await listRow.locator('[data-testid="diag-explain-result"]').waitFor();
  await context.close();
});

test("켜짐: 저장된 토큰은 저장된 SQL만 실행 (요청 SQL 무시)", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(BASE + `/search?q=${enc("파이썬")}`);
  await openPanel(page);
  const token = await page.locator('[data-testid="diag-query"][data-label="COUNT"] [data-testid="diag-explain-btn"]').getAttribute("data-token");
  const r = await explain({ token, sql: "SELECT pg_sleep(5)" });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.scans.some((s) => /Scan/.test(s)));
  assert.ok(j.executionMs < 4000);
  assert.deepEqual(Object.keys(j).sort(), ["executionMs", "planningMs", "rowsRead", "rowsReturned", "scans", "sharedHit", "sharedRead"]);
  await context.close();
});

test("켜짐: 상세 패널의 쿼리 라벨과 소장 상태 지연", async () => {
  const { body } = await getJson(`/api/search?q=${enc("연구")}&sort=popular`);
  const id = body.items[0].id;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(BASE + `/search?q=${enc("연구")}&sort=popular`);
  await page.locator('[data-testid="diag-panel"]').waitFor();
  await page.locator('[data-testid="result-item"]').first().click();
  await page.locator('[data-testid="book-title"]').waitFor();
  await openPanel(page);
  await page.waitForFunction(() => !document.querySelector('[data-testid="diag-total"]').textContent.includes("측정 중"));
  const labels = await page.locator('[data-testid="diag-query"]').evaluateAll((els) => els.map((e) => e.dataset.label));
  assert.deepEqual(labels, ["도서(저자 조인 포함)", "리뷰 목록", "리뷰 집계", "추천"]);
  const note = await page.locator('[data-testid="diag-note"]').textContent();
  assert.match(note, /소장 상태/);
  const ms = Number(note.match(/([\d.]+)ms/)[1]);
  assert.ok(ms >= 95, note);
  const total = await page.locator('[data-testid="diag-total"]').textContent();
  assert.match(total, /^[\d.]+ms/, total);
  console.log("detail total/segments:", total, "|", await page.locator('[data-testid="diag-segments"]').textContent());
  assert.match(await page.locator('[data-testid="diag-criteria"]').textContent(), /1000ms/);
  assert.match(await page.locator('[data-testid="diag-cause"]').textContent(), /추정/);
  await context.close();

  const direct = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await direct.newPage();
  await p2.goto(BASE + `/books/${id}`);
  await openPanel(p2);
  await p2.waitForFunction(() => !document.querySelector('[data-testid="diag-total"]').textContent.includes("측정 중"));
  assert.match(await p2.locator('[data-testid="diag-total"]').textContent(), /Navigation Timing/);
  await direct.close();
});
