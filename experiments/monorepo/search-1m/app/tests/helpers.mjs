import pg from "pg";

export const BASE = process.env.BASE_URL ?? "http://localhost:3000";
export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://bench:bench-local-only@127.0.0.1:55432/books";

export async function getJson(path) {
  const res = await fetch(BASE + path);
  return { status: res.status, body: await res.json() };
}

export function newPool() {
  return new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
}

export const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");
