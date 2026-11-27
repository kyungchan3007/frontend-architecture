"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { DiagData, DiagQuery, ExplainSummary } from "@/lib/diagTypes";

type Kind = "home" | "search" | "detail";
type Measure = {
  total: number | null;
  source: string;
  network: number | null;
  render: number | null;
  transfer: number | null;
  decoded: number | null;
};
type Explain = ExplainSummary | "loading" | "error";

const START_KEY = "diag:start";
const NA = "측정 불가";

// 문서 단위 상태 (소프트 이동 후에도 유지)
let hardDone = false;
let installed = false;
const ac: { v: number; count: number; last: { q: string; clientMs: number; data: DiagData | null } | null } = {
  v: 0,
  count: 0,
  last: null,
};
const subs = new Set<() => void>();
const emit = () => {
  ac.v++;
  subs.forEach((f) => f());
};

function install() {
  if (installed) return;
  installed = true;
  performance.setResourceTimingBufferSize?.(2000);
  const mark = () => {
    try {
      sessionStorage.setItem(
        START_KEY,
        JSON.stringify({ perf: performance.now(), origin: performance.timeOrigin }),
      );
    } catch {}
  };
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (a && a.origin === location.origin) mark();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter" && (e.target as Element | null)?.matches?.('[data-testid="search-input"]')) mark();
    },
    true,
  );
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/api/autocomplete")) return orig(input, init);
    ac.count++;
    const q = new URL(url, location.origin).searchParams.get("q") ?? "";
    const t0 = performance.now();
    const res = await orig(input, init);
    const clientMs = performance.now() - t0;
    res
      .clone()
      .json()
      .then((j) => {
        ac.last = { q, clientMs, data: j?._diag ?? null };
        emit();
      })
      .catch(() => {});
    emit();
    return res;
  };
}

function readStart(): { perf: number; origin: number } | null {
  try {
    const raw = sessionStorage.getItem(START_KEY);
    sessionStorage.removeItem(START_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const pos = (n: number) => (Number.isFinite(n) && n >= 0 ? n : null);
const size = (n: number | undefined) => (n && n > 0 ? n : null);

function measure(data: DiagData | null): Measure {
  const endPerf = performance.now();
  const m: Measure = { total: null, source: NA, network: null, render: null, transfer: null, decoded: null };
  if (!hardDone) {
    hardDone = true;
    readStart();
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      m.source = "직접 열기 (Navigation Timing 기준)";
      m.total = pos(endPerf - nav.startTime);
      if (data) m.network = pos(nav.responseEnd - nav.fetchStart - data.serverMs);
      m.render = pos(endPerf - nav.responseEnd);
      m.transfer = size(nav.transferSize);
      m.decoded = size(nav.decodedBodySize);
    }
    return m;
  }
  const start = readStart();
  if (!start || start.origin !== performance.timeOrigin) return m;
  m.source = "화면 이동 (동작 시각 → 렌더링 후 rAF 2회)";
  m.total = pos(endPerf - start.perf);
  const rsc = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
    .filter((e) => e.name.includes("_rsc=") && e.startTime >= start.perf - 1)
    .pop();
  if (rsc) {
    if (data) m.network = pos(rsc.duration - data.serverMs);
    m.render = pos(endPerf - rsc.responseEnd);
    m.transfer = size(rsc.transferSize);
    m.decoded = size(rsc.decodedBodySize);
  }
  return m;
}

const ms = (n: number | null | undefined) => (n === null || n === undefined ? NA : `${n.toFixed(1)}ms`);
const bytes = (n: number | null) => (n === null ? NA : `${n.toLocaleString("ko-KR")}B`);
const blocks = (n: number) => `${n.toLocaleString("ko-KR")}블록 (${((n * 8) / 1024).toFixed(1)}MB)`;

function estimate(kind: Kind, data: DiagData | null, m: Measure | null, explains: Record<string, Explain>): string[] {
  const out: string[] = [];
  if (data && data.serverMs > 0) {
    const items = [
      ...data.queries.map((q) => ({ label: `${q.label} 쿼리`, ms: q.waitMs + q.execMs })),
      ...data.notes.map((n) => ({ label: n.label, ms: n.ms })),
    ];
    const top = items.sort((a, b) => b.ms - a.ms)[0];
    if (top && top.ms / data.serverMs >= 0.5) {
      out.push(`${top.label}이(가) 서버 시간의 ${Math.round((top.ms / data.serverMs) * 100)}% (${ms(top.ms)})`);
    }
    const wait = data.queries.reduce((a, q) => a + q.waitMs, 0);
    if (wait / data.serverMs >= 0.2) {
      out.push(`커넥션 대기가 서버 시간의 ${Math.round((wait / data.serverMs) * 100)}% (${ms(wait)})`);
    }
    for (const q of data.queries) {
      const e = explains[q.token];
      if (e && typeof e === "object" && e.scans.some((s) => s.startsWith("Seq Scan") || s.startsWith("Parallel Seq Scan"))) {
        if (e.rowsRead > 10 * Math.max(e.rowsReturned, 1)) {
          out.push(
            `${q.label}: 실행 계획이 ${e.scans.join(", ")}, 읽은 행 ${e.rowsRead.toLocaleString("ko-KR")} 중 반환 ${e.rowsReturned.toLocaleString("ko-KR")}`,
          );
        }
      }
    }
  }
  if (kind !== "home" && m && data && m.network !== null && m.render !== null) {
    const seg = [
      { n: "서버", v: data.serverMs },
      { n: "네트워크", v: m.network },
      { n: "렌더링", v: m.render },
    ].sort((a, b) => b.v - a.v)[0];
    out.push(`가장 큰 구간은 ${seg.n} (${ms(seg.v)})`);
  }
  return out;
}

function QueryRow({
  q,
  testid,
  explain,
  onExplain,
}: {
  q: DiagQuery;
  testid: string;
  explain: Explain | undefined;
  onExplain: (q: DiagQuery) => void;
}) {
  return (
    <li data-testid={testid} data-label={q.label}>
      <div>
        <b>{q.label}</b> · 실행 {ms(q.execMs)} · {q.rows.toLocaleString("ko-KR")}행 · 커넥션 대기 {ms(q.waitMs)}
      </div>
      <button type="button" data-testid="diag-explain-btn" data-token={q.token} onClick={() => onExplain(q)}>
        실행 계획 보기
      </button>
      {explain === "loading" && <div>실행 계획을 실행하는 중...</div>}
      {explain === "error" && <div data-testid="diag-explain-result">실행 계획을 가져오지 못했습니다.</div>}
      {explain && typeof explain === "object" && (
        <div data-testid="diag-explain-result">
          <div>스캔 방식: {explain.scans.length ? explain.scans.join(", ") : NA}</div>
          <div>
            읽은 행 {explain.rowsRead.toLocaleString("ko-KR")} / 반환 {explain.rowsReturned.toLocaleString("ko-KR")}
          </div>
          <div>
            메모리 읽기(shared hit) {blocks(explain.sharedHit)} · 디스크 읽기(shared read) {blocks(explain.sharedRead)}
          </div>
          <div>실행 {ms(explain.executionMs)} · 계획 {ms(explain.planningMs)}</div>
        </div>
      )}
    </li>
  );
}

export default function DiagPanel({ kind, data }: { kind: Kind; data: DiagData | null }) {
  const [open, setOpen] = useState(false);
  const [m, setM] = useState<Measure | null>(null);
  const [explains, setExplains] = useState<Record<string, Explain>>({});
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => ac.v,
    () => 0,
  );

  useEffect(() => {
    install();
    let dead = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!dead) setM(measure(data));
      }),
    );
    return () => {
      dead = true;
    };
  }, [data?.reqId]);

  async function onExplain(q: DiagQuery) {
    setExplains((s) => ({ ...s, [q.token]: "loading" }));
    try {
      const res = await fetch("/api/diag/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: q.token }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as ExplainSummary;
      setExplains((s) => ({ ...s, [q.token]: j }));
    } catch {
      setExplains((s) => ({ ...s, [q.token]: "error" }));
    }
  }

  const last = ac.last;
  const acData = last?.data ?? null;
  const allExplains = explains;
  const criteria: { name: string; value: number | null; limit: number }[] = [];
  if (kind === "home") criteria.push({ name: "자동완성 서버 시간", value: acData ? acData.serverMs : null, limit: 100 });
  if (kind === "search") criteria.push({ name: "검색 전체 (서버 기준)", value: data ? data.serverMs : null, limit: 500 });
  if (kind === "detail") criteria.push({ name: "상세 클릭 → 표시", value: m ? m.total : null, limit: 1000 });
  const causes = estimate(kind, kind === "home" ? acData : data, m, allExplains);
  const summary =
    kind === "home"
      ? last
        ? `자동완성 서버 ${ms(acData?.serverMs)}`
        : "입력하면 표시됩니다"
      : `전체 ${ms(m?.total)} · 서버 ${ms(data?.serverMs)} · 쿼리 ${data?.queries.length ?? 0}개`;

  return (
    <aside data-testid="diag-panel" className="diag">
      <style>{`
        body{padding-bottom:56px}
        .diag{position:fixed;left:0;right:0;bottom:0;z-index:50;background:#111;color:#eee;font-size:12px;line-height:1.5;border-top:2px solid #f5a623}
        .diag-inner{max-width:480px;margin:0 auto}
        .diag-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 12px;width:100%;background:none;border:0;color:inherit;font:inherit;text-align:left}
        .diag-body{max-height:55vh;overflow:auto;padding:0 12px 12px}
        .diag h4{margin:10px 0 4px;font-size:12px;color:#f5a623}
        .diag ul{padding:0;margin:0;list-style:none}
        .diag li{padding:4px 0;border-bottom:1px solid #333}
        .diag button.act{font-size:12px;padding:2px 8px}
        .diag li button{font-size:12px;margin-top:2px}
        .diag .over{color:#ff7b72}.diag .ok{color:#7ee787}
      `}</style>
      <div className="diag-inner">
        <button type="button" className="diag-bar" data-testid="diag-toggle" onClick={() => setOpen((o) => !o)}>
          <span data-testid="diag-summary">진단 · {summary}</span>
          <span>{open ? "접기" : "펴기"}</span>
        </button>
        <div className="diag-body" hidden={!open}>
          {kind !== "home" && (
            <>
              <h4>전체 시간</h4>
              <div data-testid="diag-total">
                {ms(m?.total)} <span style={{ color: "#999" }}>({m ? m.source : "측정 중"})</span>
              </div>
              <h4>구간</h4>
              <div data-testid="diag-segments">
                서버 {ms(data?.serverMs)} · 네트워크 {ms(m?.network)} · 렌더링 {ms(m?.render)}
              </div>
              <h4>쿼리 {data?.queries.length ?? 0}개</h4>
              <ul>
                {data?.queries.map((q) => (
                  <QueryRow key={q.token} q={q} testid="diag-query" explain={explains[q.token]} onExplain={onExplain} />
                ))}
                {data?.notes.map((n) => (
                  <li key={n.label} data-testid="diag-note">
                    {n.label}: {ms(n.ms)}
                  </li>
                ))}
              </ul>
              <div style={{ color: "#999" }}>실행 계획 버튼은 쿼리를 한 번 더 실행하므로 시간이 듭니다.</div>
              <h4>응답 크기</h4>
              <div data-testid="diag-size">
                전송 {bytes(m?.transfer ?? null)} · 압축 해제 {bytes(m?.decoded ?? null)}
              </div>
            </>
          )}
          {kind === "home" && (
            <>
              <h4>자동완성</h4>
              <div data-testid="diag-autocomplete" data-count={ac.count}>
                <div>이 페이지에서 보낸 요청 {ac.count}건</div>
                {last ? (
                  <>
                    <div>
                      마지막 입력어 &apos;{last.q}&apos; · 서버 {ms(acData?.serverMs)} · 왕복 {ms(last.clientMs)}
                    </div>
                    <ul>
                      {acData?.queries.map((q) => (
                        <QueryRow key={q.token} q={q} testid="diag-ac-query" explain={explains[q.token]} onExplain={onExplain} />
                      ))}
                    </ul>
                    <div style={{ color: "#999" }}>실행 계획 버튼은 쿼리를 한 번 더 실행하므로 시간이 듭니다.</div>
                  </>
                ) : (
                  <div>아직 요청이 없습니다.</div>
                )}
              </div>
            </>
          )}
          <h4>합격 기준 (SDD)</h4>
          <ul data-testid="diag-criteria">
            {criteria.map((c) => (
              <li key={c.name}>
                {c.name} {ms(c.value)} / {c.limit}ms ·{" "}
                {c.value === null ? (
                  NA
                ) : c.value <= c.limit ? (
                  <span className="ok">기준 이내</span>
                ) : (
                  <span className="over">기준 초과</span>
                )}
              </li>
            ))}
          </ul>
          <h4>추정 원인 (규칙 기반 추정)</h4>
          <ul data-testid="diag-cause">
            {causes.length ? causes.map((c) => <li key={c}>추정: {c}</li>) : <li>추정: 뚜렷한 원인 규칙에 해당하지 않음</li>}
          </ul>
        </div>
      </div>
    </aside>
  );
}
