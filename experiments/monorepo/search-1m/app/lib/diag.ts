import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { QueryResult, QueryResultRow } from "pg";
import { pool } from "./db";
import type { DiagData, DiagNote, DiagQuery, ExplainSummary } from "./diagTypes";

// 런타임에 읽는다. 꺼져 있으면 아래 모든 함수가 원래 동작과 같은 경로로 바로 빠져나간다.
export const diagEnabled = (): boolean => process.env.DIAG_ENABLED === "1";

type Store = { queries: DiagQuery[]; notes: DiagNote[] };
type Saved = { sql: string; values: unknown[] };

const g = globalThis as unknown as {
  diagAls?: AsyncLocalStorage<Store>;
  diagSaved?: Map<string, Saved>;
};

const MAX_SAVED = 200;

function save(sql: string, values: unknown[]): string {
  const map = (g.diagSaved ??= new Map());
  const token = randomUUID();
  map.set(token, { sql, values });
  while (map.size > MAX_SAVED) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
  return token;
}

// 꺼져 있으면 pool.query와 같은 호출이다. 켜져 있고 요청 문맥이 있을 때만 대기와 실행을 따로 잰다.
export async function dq<R extends QueryResultRow = QueryResultRow>(
  label: string,
  sql: string,
  values: unknown[],
): Promise<QueryResult<R>> {
  if (!diagEnabled()) return pool.query<R>(sql, values);
  const store = g.diagAls?.getStore();
  if (!store) return pool.query<R>(sql, values);
  const t0 = performance.now();
  const client = await pool.connect();
  const t1 = performance.now();
  let res: QueryResult<R>;
  try {
    res = await client.query<R>(sql, values);
  } finally {
    client.release();
  }
  const t2 = performance.now();
  store.queries.push({
    label,
    token: save(sql, values),
    waitMs: t1 - t0,
    execMs: t2 - t1,
    rows: res.rowCount ?? res.rows.length,
  });
  return res;
}

export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!diagEnabled()) return fn();
  const store = g.diagAls?.getStore();
  const t = performance.now();
  const v = await fn();
  store?.notes.push({ label, ms: performance.now() - t });
  return v;
}

export async function withDiag<T>(fn: () => Promise<T>): Promise<{ value: T; diag: DiagData | null }> {
  if (!diagEnabled()) return { value: await fn(), diag: null };
  const als = (g.diagAls ??= new AsyncLocalStorage<Store>());
  const store: Store = { queries: [], notes: [] };
  const t0 = performance.now();
  const value = await als.run(store, fn);
  return {
    value,
    diag: { reqId: randomUUID(), serverMs: performance.now() - t0, queries: store.queries, notes: store.notes },
  };
}

type PlanNode = {
  "Node Type": string;
  "Relation Name"?: string;
  "Actual Rows"?: number;
  "Actual Loops"?: number;
  "Rows Removed by Filter"?: number;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  Plans?: PlanNode[];
};

function walk(node: PlanNode, acc: { scans: string[]; rowsRead: number }) {
  const type = node["Node Type"];
  if (type.endsWith("Scan")) {
    acc.scans.push(node["Relation Name"] ? `${type} on ${node["Relation Name"]}` : type);
    if (type !== "Bitmap Index Scan") {
      const loops = node["Actual Loops"] ?? 1;
      acc.rowsRead += ((node["Actual Rows"] ?? 0) + (node["Rows Removed by Filter"] ?? 0)) * loops;
    }
  }
  for (const c of node.Plans ?? []) walk(c, acc);
}

// 서버가 저장해 둔 SQL만 실행한다. 클라이언트는 토큰만 보낸다.
export async function explainToken(token: string): Promise<ExplainSummary | null> {
  const saved = g.diagSaved?.get(token);
  if (!saved) return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const r = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${saved.sql}`, saved.values);
    const top = r.rows[0]["QUERY PLAN"][0];
    const plan: PlanNode = top.Plan;
    const acc = { scans: [] as string[], rowsRead: 0 };
    walk(plan, acc);
    return {
      scans: acc.scans,
      rowsRead: acc.rowsRead,
      rowsReturned: (plan["Actual Rows"] ?? 0) * (plan["Actual Loops"] ?? 1),
      sharedHit: plan["Shared Hit Blocks"] ?? 0,
      sharedRead: plan["Shared Read Blocks"] ?? 0,
      executionMs: top["Execution Time"] ?? null,
      planningMs: top["Planning Time"] ?? null,
    };
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}
