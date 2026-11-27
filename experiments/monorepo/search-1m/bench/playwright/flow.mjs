// 자동완성 → 검색 결과 → 상세의 체감 시간을 측정한다.
// 사용법: node flow.mjs --base-url URL --network fast|slow --flows 20 --out FILE
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE_URL = arg("base-url", "http://localhost:3000");
const NETWORK = arg("network", "fast");
const FLOWS = Number(arg("flows", 20));
const OUT = arg("out", "flow.json");
const TIMEOUT = 30000;

// 사용자 동작 시각과 표시 시각을 같은 시계로 기록한다. 전체 페이지 이동에서도 유지되도록 sessionStorage에 둔다.
const observer = () => {
  const put = (k, v) => { if (sessionStorage.getItem(k) === null) sessionStorage.setItem(k, String(v)); };
  const reset = (k, v) => sessionStorage.setItem(k, String(v));
  document.addEventListener("input", (e) => {
    if (e.target.matches?.('[data-testid="search-input"]')) {
      reset(`start:autocomplete:${e.target.value}`, Date.now());
      performance.mark(`start:autocomplete:${e.target.value}`);
    }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches?.('[data-testid="search-input"]')) {
      reset(`start:search:${e.target.value}`, Date.now());
      performance.mark(`start:search:${e.target.value}`);
    }
  }, true);
  document.addEventListener("click", (e) => {
    const item = e.target.closest?.('[data-testid="result-item"]');
    if (item) {
      reset(`start:detail:${item.dataset.bookId}`, Date.now());
      performance.mark(`start:detail:${item.dataset.bookId}`);
    }
  }, true);
  const scan = () => {
    const now = Date.now();
    document.querySelectorAll('[data-testid="autocomplete-list"]').forEach((el) => put(`seen:autocomplete:${el.dataset.query}`, now));
    document.querySelectorAll('[data-testid="search-results"]').forEach((el) => put(`seen:search:${el.dataset.query}`, now));
    document.querySelectorAll('[data-testid="book-title"]').forEach((el) => {
      if (el.textContent.trim()) put(`seen:detail:${el.dataset.bookId}`, now);
    });
  };
  new MutationObserver(scan).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
};

const queries = JSON.parse(readFileSync(join(here, "..", "queries.json"), "utf-8"));
const terms = queries.search.filter((t) => t.g === "many" || t.g === "few" || t.g === "author").map((t) => t.q);
const unique = [...new Set(terms)];
const picks = Array.from({ length: FLOWS }, (_, i) => unique[(i * 7) % unique.length]);

const elapsed = (page, kind, key) => page.waitForFunction(
  ([k]) => {
    const s = sessionStorage.getItem(`start:${k}`);
    const v = sessionStorage.getItem(`seen:${k}`);
    return s !== null && v !== null ? Number(v) - Number(s) : null;
  },
  [`${kind}:${key}`],
  { timeout: TIMEOUT },
).then((h) => h.jsonValue());

async function runFlow(browser, term) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR" });
  const page = await context.newPage();
  await page.addInitScript(observer);
  if (NETWORK === "slow") {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  const requests = { total: 0, autocomplete: 0, images: 0 };
  page.on("request", (r) => {
    requests.total++;
    if (r.url().includes("/api/autocomplete")) requests.autocomplete++;
    if (r.resourceType() === "image") requests.images++;
  });
  const result = { term, ok: false };
  try {
    await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    const input = page.locator('[data-testid="search-input"]');
    await input.click();
    await input.pressSequentially(term, { delay: 120 });
    result.autocomplete_ms = await elapsed(page, "autocomplete", term);
    await input.press("Enter");
    result.search_ms = await elapsed(page, "search", term);
    const item = page.locator('[data-testid="result-item"]').first();
    await item.waitFor({ timeout: TIMEOUT });
    const id = await item.getAttribute("data-book-id");
    await item.click();
    result.detail_ms = await elapsed(page, "detail", id);
    result.book_id = id;
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT }).catch(() => {});
    result.requests = requests;
    result.ok = true;
  } catch (e) {
    result.error = String(e).slice(0, 300);
    result.requests = requests;
  }
  await context.close();
  return result;
}

const pct = (values, p) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

const browser = await chromium.launch({ headless: true });
const flows = [];
for (const term of picks) flows.push(await runFlow(browser, term));
await browser.close();

const good = flows.filter((f) => f.ok);
const stat = (key) => {
  const v = good.map((f) => f[key]);
  return { p50: pct(v, 50), p95: pct(v, 95), max: pct(v, 100), count: v.length };
};
const summary = {
  network: NETWORK,
  flows: flows.length,
  failed: flows.length - good.length,
  autocomplete_ms: stat("autocomplete_ms"),
  search_ms: stat("search_ms"),
  detail_ms: stat("detail_ms"),
  avg_requests: good.length ? good.reduce((a, f) => a + f.requests.total, 0) / good.length : null,
  avg_autocomplete_requests: good.length ? good.reduce((a, f) => a + f.requests.autocomplete, 0) / good.length : null,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ summary, flows }, null, 1));
console.log(JSON.stringify(summary));
if (flows.length - good.length > 0) console.log("first error:", flows.find((f) => !f.ok).error);
