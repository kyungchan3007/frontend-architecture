import { dq } from "./diag";
import { coverFor } from "./hash";

export const PAGE_SIZE = 20;

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

export type AutocompleteItem = { type: "title" | "author"; text: string };

export async function autocomplete(q: string): Promise<{ query: string; items: AutocompleteItem[] }> {
  if (!q) return { query: q, items: [] };
  const pattern = escapeLike(q) + "%";
  const titles = await dq<{ title: string }>(
    "제목 후보",
    "SELECT title FROM books WHERE title ILIKE $1 LIMIT 10",
    [pattern],
  );
  const authors = await dq<{ name: string }>(
    "저자 후보",
    "SELECT name FROM authors WHERE name ILIKE $1 LIMIT 10",
    [pattern],
  );
  const merged: AutocompleteItem[] = [
    ...titles.rows.map((r) => ({ type: "title" as const, text: r.title })),
    ...authors.rows.map((r) => ({ type: "author" as const, text: r.name })),
  ];
  const seen = new Set<string>();
  const items: AutocompleteItem[] = [];
  for (const it of merged) {
    if (seen.has(it.text)) continue;
    seen.add(it.text);
    items.push(it);
  }
  return { query: q, items: items.slice(0, 10) };
}

export type SearchParams = { q: string; kdc?: string; sort?: string; page?: number };
export type SearchItem = {
  id: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  year: number | null;
  cover: string;
};
export type SearchResult = { query: string; page: number; total: number; items: SearchItem[] };

export async function searchBooks(params: SearchParams): Promise<SearchResult> {
  const q = params.q ?? "";
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  if (!q) return { query: q, page, total: 0, items: [] };

  const contains = "%" + escapeLike(q) + "%";
  const prefix = escapeLike(q) + "%";
  const kdc = params.kdc && /^\d$/.test(params.kdc) ? params.kdc : null;

  // pg_trgm은 1~2글자 검색에 인덱스를 쓰지 못하므로 글자 조각 인덱스로 나눈다.
  const useGrams = [...q].length <= 2;
  const titleCond = useGrams ? "text_grams(b.title) @> ARRAY[lower($1::text)]" : "b.title ILIKE $1";
  const authorCond = useGrams ? "text_grams(a.name) @> ARRAY[lower($1::text)]" : "a.name ILIKE $1";
  const matchedSql = `SELECT b.id FROM books b WHERE ${titleCond}
     UNION
     SELECT ba.book_id FROM authors a JOIN book_authors ba ON ba.author_id = a.id WHERE ${authorCond}`;

  const where: string[] = [];
  const values: unknown[] = [useGrams ? q : contains];
  if (kdc) {
    values.push(kdc + "%");
    where.push(`b.kdc LIKE $${values.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRes = await dq<{ count: string }>(
    "COUNT",
    kdc
      ? `WITH matched AS (${matchedSql}) SELECT COUNT(*) AS count FROM matched m JOIN books b ON b.id = m.id ${whereSql}`
      : `WITH matched AS (${matchedSql}) SELECT COUNT(*) AS count FROM matched`,
    values,
  );
  const total = Number(countRes.rows[0].count);

  let orderBy: string;
  const listValues = [...values];
  if (params.sort === "popular") {
    orderBy = "b.popularity DESC, b.id";
  } else if (params.sort === "latest") {
    orderBy = "b.year DESC NULLS LAST, b.id";
  } else {
    listValues.push(q, prefix);
    const k = listValues.length;
    orderBy = `CASE WHEN b.title = $${k - 1} THEN 0 WHEN b.title ILIKE $${k} THEN 1 ELSE 2 END, b.popularity DESC, b.id`;
  }
  listValues.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const n = listValues.length;
  const rows = await dq<{
    id: string;
    title: string;
    subtitle: string | null;
    publisher: string | null;
    year: number | null;
  }>(
    "목록",
    `WITH matched AS (${matchedSql})
     SELECT b.id, b.title, b.subtitle, b.publisher, b.year
     FROM matched m JOIN books b ON b.id = m.id ${whereSql}
     ORDER BY ${orderBy}
     LIMIT $${n - 1} OFFSET $${n}`,
    listValues,
  );

  const ids = rows.rows.map((r) => r.id);
  const authorMap = new Map<string, string[]>();
  if (ids.length) {
    const ar = await dq<{ book_id: string; name: string }>(
      "저자",
      `SELECT ba.book_id, a.name FROM book_authors ba JOIN authors a ON a.id = ba.author_id
       WHERE ba.book_id = ANY($1) ORDER BY ba.book_id, ba.position`,
      [ids],
    );
    for (const r of ar.rows) {
      const list = authorMap.get(r.book_id) ?? [];
      list.push(r.name);
      authorMap.set(r.book_id, list);
    }
  }

  return {
    query: q,
    page,
    total,
    items: rows.rows.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      authors: authorMap.get(r.id) ?? [],
      publisher: r.publisher,
      year: r.year,
      cover: coverFor(r.id),
    })),
  };
}

export type Book = {
  id: string;
  title: string;
  subtitle: string | null;
  publisher: string | null;
  year: number | null;
  kdc: string | null;
  series: string | null;
  volume: string | null;
  description: string | null;
  toc: string | null;
  keywords: string[] | null;
  isbn: string[] | null;
  popularity: number;
  authors: string[];
  cover: string;
};

export async function getBook(id: string): Promise<Book | null> {
  const res = await dq(
    "도서(저자 조인 포함)",
    `SELECT b.*, COALESCE(array_agg(a.name ORDER BY ba.position) FILTER (WHERE a.name IS NOT NULL), '{}') AS authors
     FROM books b
     LEFT JOIN book_authors ba ON ba.book_id = b.id
     LEFT JOIN authors a ON a.id = ba.author_id
     WHERE b.id = $1
     GROUP BY b.id`,
    [id],
  );
  if (!res.rows.length) return null;
  return { ...res.rows[0], cover: coverFor(id) } as Book;
}

export type Review = { id: string; rating: number; body: string; created_at: string };
export type ReviewResult = { avg: number | null; count: number; items: Review[] };

export async function getReviews(id: string): Promise<ReviewResult> {
  const list = await dq(
    "리뷰 목록",
    "SELECT id, rating, body, created_at FROM reviews WHERE book_id = $1 ORDER BY created_at DESC LIMIT 20",
    [id],
  );
  const agg = await dq<{ avg: string | null; count: string }>(
    "리뷰 집계",
    "SELECT AVG(rating) AS avg, COUNT(*) AS count FROM reviews WHERE book_id = $1",
    [id],
  );
  const avg = agg.rows[0].avg === null ? null : Number(agg.rows[0].avg);
  return {
    avg,
    count: Number(agg.rows[0].count),
    items: list.rows.map((r) => ({
      id: String(r.id),
      rating: r.rating,
      body: r.body,
      created_at: new Date(r.created_at).toISOString(),
    })),
  };
}

export type Recommendation = { id: string; title: string; cover: string };

export async function getRecommendations(id: string): Promise<{ items: Recommendation[] }> {
  const res = await dq<{ id: string; title: string }>(
    "추천",
    `SELECT id, title FROM books
     WHERE left(kdc, 1) = (SELECT left(kdc, 1) FROM books WHERE id = $1) AND id <> $1
     ORDER BY popularity DESC LIMIT 6`,
    [id],
  );
  return { items: res.rows.map((r) => ({ id: r.id, title: r.title, cover: coverFor(r.id) })) };
}
