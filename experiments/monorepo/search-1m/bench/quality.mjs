// 정답을 정해 둔 검색어 30개로 상위 20건 안에 정답이 있는 비율을 계산한다.
// 사용법: node bench/quality.mjs URL [출력 파일]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [base, out] = process.argv.slice(2);
const set = JSON.parse(readFileSync(join(here, "quality.json"), "utf-8"));
const rows = [];
for (const item of set) {
  const res = await fetch(`${base}/api/search?q=${encodeURIComponent(item.query)}`);
  const body = res.ok ? await res.json() : { items: [] };
  const ids = (body.items || []).slice(0, 20).map((b) => b.id);
  rows.push({ ...item, status: res.status, hit: ids.includes(item.expected_id), rank: ids.indexOf(item.expected_id) + 1 || null });
}
const byKind = {};
for (const r of rows) {
  byKind[r.kind] ??= { hit: 0, total: 0 };
  byKind[r.kind].total++;
  byKind[r.kind].hit += r.hit ? 1 : 0;
}
const hits = rows.filter((r) => r.hit).length;
const summary = { hit_at_20: hits, total: rows.length, rate: hits / rows.length, by_kind: byKind };
console.log(JSON.stringify(summary));
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ summary, rows }, null, 1));
}
