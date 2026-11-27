import test, { after } from "node:test";
import assert from "node:assert/strict";
import { getJson, newPool, escapeLike } from "./helpers.mjs";

const pool = newPool();
after(() => pool.end());

const enc = encodeURIComponent;

test("autocomplete: 응답 형태, 최대 10개, 중복 없음", async () => {
  const { status, body } = await getJson(`/api/autocomplete?q=${enc("한국")}`);
  assert.equal(status, 200);
  assert.equal(body.query, "한국");
  assert.ok(Array.isArray(body.items));
  assert.ok(body.items.length > 0 && body.items.length <= 10);
  for (const it of body.items) {
    assert.ok(it.type === "title" || it.type === "author");
    assert.equal(typeof it.text, "string");
    assert.ok(it.text.toLowerCase().startsWith("한국"));
  }
  assert.equal(new Set(body.items.map((i) => i.text)).size, body.items.length);
});

test("autocomplete: 빈 q는 빈 목록", async () => {
  const { body } = await getJson("/api/autocomplete?q=");
  assert.deepEqual(body, { query: "", items: [] });
  const none = await getJson("/api/autocomplete");
  assert.deepEqual(none.body.items, []);
});

test("search: 응답 형태와 total이 COUNT와 일치", async () => {
  const q = "파이썬";
  const { status, body } = await getJson(`/api/search?q=${enc(q)}`);
  assert.equal(status, 200);
  assert.equal(body.query, q);
  assert.equal(body.page, 1);
  assert.equal(body.items.length, 20);
  const it = body.items[0];
  for (const k of ["id", "title", "subtitle", "authors", "publisher", "year", "cover"]) assert.ok(k in it, k);
  assert.ok(Array.isArray(it.authors));
  assert.match(it.cover, /^\/covers\/cover-(0[1-9]|1\d|20)\.jpg$/);
  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM books b WHERE b.title ILIKE $1 OR EXISTS (
       SELECT 1 FROM book_authors ba JOIN authors a ON a.id=ba.author_id WHERE ba.book_id=b.id AND a.name ILIKE $1)`,
    ["%" + escapeLike(q) + "%"],
  );
  assert.equal(body.total, Number(rows[0].count));
});

test("search: q가 비면 빈 결과", async () => {
  const { body } = await getJson("/api/search?q=");
  assert.equal(body.total, 0);
  assert.deepEqual(body.items, []);
});

test("search: 관련순은 제목 일치, 접두 일치가 먼저", async () => {
  const { body } = await getJson(`/api/search?q=${enc("사랑")}`);
  const rank = (t) => (t === "사랑" ? 0 : t.toLowerCase().startsWith("사랑") ? 1 : 2);
  const ranks = body.items.map((i) => rank(i.title));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test("search: kdc 필터", async () => {
  const q = "연구";
  const all = await getJson(`/api/search?q=${enc(q)}`);
  const f = await getJson(`/api/search?q=${enc(q)}&kdc=3`);
  assert.ok(f.body.total > 0 && f.body.total < all.body.total);
  const { rows } = await pool.query(
    "SELECT id, kdc FROM books WHERE id = ANY($1)",
    [f.body.items.map((i) => i.id)],
  );
  assert.equal(rows.length, f.body.items.length);
  for (const r of rows) assert.ok(r.kdc.startsWith("3"), r.kdc);
});

test("search: 정렬(인기순, 최신순)", async () => {
  const q = "연구";
  const pop = await getJson(`/api/search?q=${enc(q)}&sort=popular`);
  const ids = pop.body.items.map((i) => i.id);
  const { rows } = await pool.query("SELECT id, popularity FROM books WHERE id = ANY($1)", [ids]);
  const m = new Map(rows.map((r) => [r.id, r.popularity]));
  const pops = ids.map((id) => m.get(id));
  assert.deepEqual(pops, [...pops].sort((a, b) => b - a));

  const lat = await getJson(`/api/search?q=${enc(q)}&sort=latest`);
  const years = lat.body.items.map((i) => i.year);
  assert.deepEqual(years, [...years].sort((a, b) => b - a));
  assert.notDeepEqual(pop.body.items.map((i) => i.id), lat.body.items.map((i) => i.id));
});

test("search: 페이지 2는 페이지 1과 겹치지 않음", async () => {
  const q = "연구";
  const p1 = await getJson(`/api/search?q=${enc(q)}&page=1`);
  const p2 = await getJson(`/api/search?q=${enc(q)}&page=2`);
  assert.equal(p2.body.page, 2);
  assert.equal(p2.body.items.length, 20);
  const a = new Set(p1.body.items.map((i) => i.id));
  for (const i of p2.body.items) assert.ok(!a.has(i.id));
  assert.equal(p1.body.total, p2.body.total);
});

test("search: %, _ 는 와일드카드로 동작하지 않음", async () => {
  for (const q of ["%", "_", "\\", "연%구", "연_구"]) {
    const { status, body } = await getJson(`/api/search?q=${enc(q)}`);
    assert.equal(status, 200);
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM books b WHERE position(lower($1) in lower(b.title)) > 0 OR EXISTS (
         SELECT 1 FROM book_authors ba JOIN authors a ON a.id=ba.author_id WHERE ba.book_id=b.id AND position(lower($1) in lower(a.name)) > 0)`,
      [q],
    );
    assert.equal(body.total, Number(rows[0].count), `q=${q}`);
    for (const it of body.items) {
      const hay = (it.title + "\n" + it.authors.join("\n")).toLowerCase();
      assert.ok(hay.includes(q.toLowerCase()), `q=${q} title=${it.title}`);
    }
  }
  const ac = await getJson(`/api/autocomplete?q=${enc("%")}`);
  for (const it of ac.body.items) assert.ok(it.text.startsWith("%"), it.text);
  const ac2 = await getJson(`/api/autocomplete?q=${enc("_")}`);
  for (const it of ac2.body.items) assert.ok(it.text.startsWith("_"), it.text);
});

test("SQL 인젝션 문자열이 안전함", async () => {
  const before = (await pool.query("SELECT COUNT(*) FROM books")).rows[0].count;
  for (const q of ["'; DROP TABLE books; --", "' OR '1'='1", "\" OR 1=1 --", "연구'); DELETE FROM reviews; --"]) {
    for (const path of [`/api/search?q=${enc(q)}&kdc=${enc("1' OR '1'='1")}&sort=${enc("popular; DROP TABLE books")}`, `/api/autocomplete?q=${enc(q)}`]) {
      const { status, body } = await getJson(path);
      assert.equal(status, 200, path);
      assert.ok(Array.isArray(body.items));
    }
    const r = await getJson(`/api/books/${enc(q)}`);
    assert.equal(r.status, 404);
  }
  assert.equal((await pool.query("SELECT COUNT(*) FROM books")).rows[0].count, before);
  assert.ok(Number((await pool.query("SELECT COUNT(*) FROM reviews")).rows[0].count) > 0);
});

async function sampleBookId() {
  const { body } = await getJson(`/api/search?q=${enc("연구")}&sort=popular`);
  return body.items[0].id;
}

test("books/:id: 전체 필드, authors, cover", async () => {
  const id = await sampleBookId();
  const { status, body } = await getJson(`/api/books/${id}`);
  assert.equal(status, 200);
  for (const k of ["id", "title", "subtitle", "publisher", "year", "kdc", "series", "volume", "description", "toc", "keywords", "isbn", "popularity", "authors", "cover"]) {
    assert.ok(k in body, k);
  }
  assert.equal(body.id, id);
  assert.ok(Array.isArray(body.authors));
  assert.match(body.cover, /^\/covers\/cover-\d\d\.jpg$/);
});

test("books/:id: 없는 도서는 404", async () => {
  const { status } = await getJson("/api/books/NOPE-0000");
  assert.equal(status, 404);
});

test("books/:id: 저자 없는 도서도 authors는 빈 배열", async () => {
  const { rows } = await pool.query(
    "SELECT id FROM books b WHERE NOT EXISTS (SELECT 1 FROM book_authors WHERE book_id=b.id) ORDER BY popularity DESC LIMIT 1",
  );
  const { body } = await getJson(`/api/books/${rows[0].id}`);
  assert.deepEqual(body.authors, []);
});

test("reviews: 최신 20건과 avg, count", async () => {
  const { rows } = await pool.query(
    "SELECT book_id, count(*) c FROM reviews GROUP BY book_id ORDER BY c DESC LIMIT 1",
  );
  const id = rows[0].book_id;
  const { status, body } = await getJson(`/api/books/${id}/reviews`);
  assert.equal(status, 200);
  assert.equal(body.count, Number(rows[0].c));
  assert.equal(typeof body.avg, "number");
  assert.equal(body.items.length, Math.min(20, body.count));
  const dates = body.items.map((r) => r.created_at);
  assert.deepEqual(dates, [...dates].sort().reverse());
  for (const k of ["id", "rating", "body", "created_at"]) assert.ok(k in body.items[0]);
});

test("reviews: 리뷰 없는 도서는 빈 목록", async () => {
  const { body, status } = await getJson("/api/books/NOPE-0000/reviews");
  assert.equal(status, 200);
  assert.equal(body.count, 0);
  assert.deepEqual(body.items, []);
});

test("recommendations: 같은 대분류 6건, 자기 자신 제외, 인기순", async () => {
  const id = await sampleBookId();
  const { status, body } = await getJson(`/api/books/${id}/recommendations`);
  assert.equal(status, 200);
  assert.equal(body.items.length, 6);
  assert.ok(!body.items.some((i) => i.id === id));
  const kdc = (await pool.query("SELECT kdc FROM books WHERE id=$1", [id])).rows[0].kdc;
  const { rows } = await pool.query("SELECT id, kdc, popularity FROM books WHERE id = ANY($1)", [body.items.map((i) => i.id)]);
  for (const r of rows) assert.equal(r.kdc[0], kdc[0]);
  const m = new Map(rows.map((r) => [r.id, r.popularity]));
  const pops = body.items.map((i) => m.get(i.id));
  assert.deepEqual(pops, [...pops].sort((a, b) => b - a));
});

test("recommendations: kdc 없는 도서는 빈 목록", async () => {
  const { rows } = await pool.query("SELECT id FROM books WHERE kdc IS NULL LIMIT 1");
  if (!rows.length) return;
  const { body } = await getJson(`/api/books/${rows[0].id}/recommendations`);
  assert.deepEqual(body.items, []);
});

test("holding: 100ms 이상 지연, 같은 id는 같은 상태", async () => {
  const id = await sampleBookId();
  const t = Date.now();
  const a = await getJson(`/api/books/${id}/holding`);
  assert.ok(Date.now() - t >= 95);
  assert.ok(["available", "loaned"].includes(a.body.status));
  const b = await getJson(`/api/books/${id}/holding`);
  assert.equal(a.body.status, b.body.status);
});

test("상세 페이지: 제목이 HTML에 있고 없는 도서는 404", async () => {
  const { BASE } = await import("./helpers.mjs");
  const id = await sampleBookId();
  const book = (await getJson(`/api/books/${id}`)).body;
  const res = await fetch(`${BASE}/books/${id}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('data-testid="book-title"'));
  assert.ok(html.includes(book.title.replace(/&/g, "&amp;")) || html.includes(book.title));
  assert.equal((await fetch(`${BASE}/books/NOPE-0000`)).status, 404);
});
