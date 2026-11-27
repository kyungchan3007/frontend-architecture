import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { BASE } from "./helpers.mjs";

let browser;
before(async () => {
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser.close();
});

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR" });
  const page = await context.newPage();
  const acRequests = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/api/autocomplete") acRequests.push(u.searchParams.get("q"));
  });
  return { context, page, acRequests };
}

test("흐름: 입력 → 후보 → Enter → 결과 → 클릭 → 상세", async () => {
  const { context, page } = await newPage();
  await page.goto(BASE + "/");
  const input = page.locator('[data-testid="search-input"]');
  await input.click();
  await input.pressSequentially("파이썬", { delay: 50 });
  const list = page.locator('[data-testid="autocomplete-list"][data-query="파이썬"]');
  await list.waitFor();
  assert.ok((await list.locator("li").count()) > 0);
  await input.press("Enter");
  await page.waitForURL(/\/search\?q=/);
  const results = page.locator('[data-testid="search-results"][data-query="파이썬"]');
  await results.waitFor();
  const first = page.locator('[data-testid="result-item"]').first();
  const id = await first.getAttribute("data-book-id");
  assert.ok(id);
  await first.click();
  await page.waitForURL(/\/books\//);
  const title = page.locator('[data-testid="book-title"]');
  await title.waitFor();
  assert.equal(await title.getAttribute("data-book-id"), id);
  assert.ok((await title.textContent()).trim().length > 0);
  await context.close();
});

test("후보를 누르면 그 말로 검색", async () => {
  const { context, page } = await newPage();
  await page.goto(BASE + "/");
  const input = page.locator('[data-testid="search-input"]');
  await input.click();
  await input.pressSequentially("해리", { delay: 50 });
  await page.locator('[data-testid="autocomplete-list"][data-query="해리"] li a').first().waitFor();
  const text = (await page.locator('[data-testid="autocomplete-list"] li a').first().textContent()).replace(/^(제목|저자)/, "");
  await page.locator('[data-testid="autocomplete-list"] li a').first().click();
  await page.waitForURL(/\/search\?q=/);
  assert.equal(new URL(page.url()).searchParams.get("q"), text);
  await page.locator('[data-testid="search-results"]').waitFor();
  await context.close();
});

test("결과 0건이어도 search-results가 렌더링됨", async () => {
  const { context, page } = await newPage();
  await page.goto(BASE + "/search?q=" + encodeURIComponent("zzqxjw없는말뭉치"));
  const results = page.locator('[data-testid="search-results"]');
  await results.waitFor();
  assert.equal(await results.getAttribute("data-query"), "zzqxjw없는말뭉치");
  assert.equal(await page.locator('[data-testid="result-item"]').count(), 0);
  await context.close();
});

test("검색 화면: 필터, 정렬, 다음 페이지 링크", async () => {
  const { context, page } = await newPage();
  await page.goto(BASE + "/search?q=" + encodeURIComponent("연구"));
  const ids1 = await page.locator('[data-testid="result-item"]').evaluateAll((els) => els.map((e) => e.dataset.bookId));
  await page.getByRole("link", { name: "다음" }).click();
  await page.waitForURL(/page=2/);
  const ids2 = await page.locator('[data-testid="result-item"]').evaluateAll((els) => els.map((e) => e.dataset.bookId));
  assert.equal(ids2.length, 20);
  assert.ok(ids2.every((i) => !ids1.includes(i)));
  await page.getByRole("link", { name: "인기순" }).click();
  await page.waitForURL(/sort=popular/);
  await page.getByRole("link", { name: "사회과학" }).click();
  await page.waitForURL(/kdc=3/);
  assert.ok((await page.locator('[data-testid="result-item"]').count()) > 0);
  await context.close();
});

test("상세: 저자 없는 도서는 '저자 정보 없음'", async () => {
  const pg = (await import("pg")).default;
  const { DATABASE_URL } = await import("./helpers.mjs");
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  const { rows } = await pool.query(
    "SELECT id FROM books b WHERE NOT EXISTS (SELECT 1 FROM book_authors WHERE book_id=b.id) ORDER BY popularity DESC LIMIT 1",
  );
  await pool.end();
  const { context, page } = await newPage();
  await page.goto(BASE + "/books/" + rows[0].id);
  await page.locator('[data-testid="book-title"]').waitFor();
  assert.ok((await page.textContent("body")).includes("저자 정보 없음"));
  await context.close();
});

test("한글 조합 입력: 조합 중에는 요청 없고, 조합이 끝나면 요청", async () => {
  const { context, page, acRequests } = await newPage();
  await page.goto(BASE + "/");
  const input = page.locator('[data-testid="search-input"]');
  await input.click();
  const cdp = await context.newCDPSession(page);
  const compose = (text) =>
    cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
  const settle = () => page.waitForTimeout(400);

  // "한" 조합: ㅎ -> 하 -> 한
  for (const t of ["ㅎ", "하", "한"]) await compose(t);
  await settle();
  assert.deepEqual(acRequests, [], "조합 중에는 요청이 없어야 함");
  await cdp.send("Input.insertText", { text: "한" });
  await page.locator('[data-testid="autocomplete-list"][data-query="한"]').waitFor();
  assert.deepEqual(acRequests, ["한"], "조합이 끝나면 정확히 한 번 요청");

  // "한글" : 두 번째 글자 조합
  for (const t of ["ㄱ", "그", "글"]) await compose(t);
  await settle();
  assert.deepEqual(acRequests, ["한"], "두 번째 조합 중에도 요청 없음");
  await cdp.send("Input.insertText", { text: "글" });
  await page.locator('[data-testid="autocomplete-list"][data-query="한글"]').waitFor();
  assert.deepEqual(acRequests, ["한", "한글"]);
  assert.equal(await input.inputValue(), "한글");
  await context.close();
});
