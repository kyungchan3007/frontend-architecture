import DiagLoader from "@/components/DiagLoader";
import Link from "next/link";
import { searchBooks } from "@/lib/books";
import { withDiag } from "@/lib/diag";

export const dynamic = "force-dynamic";

const KDC: Record<string, string> = {
  "0": "총류", "1": "철학", "2": "종교", "3": "사회과학", "4": "자연과학",
  "5": "기술과학", "6": "예술", "7": "언어", "8": "문학", "9": "역사",
};
const SORTS: [string, string][] = [["relevance", "관련순"], ["popular", "인기순"], ["latest", "최신순"]];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kdc?: string; sort?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const kdc = sp.kdc && /^\d$/.test(sp.kdc) ? sp.kdc : "";
  const sort = sp.sort === "popular" || sp.sort === "latest" ? sp.sort : "relevance";
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const { value: result, diag } = await withDiag(() => searchBooks({ q, kdc, sort, page }));
    const lastPage = Math.max(1, Math.ceil(result.total / 20));

  const href = (o: { kdc?: string; sort?: string; page?: number }) => {
    const p = new URLSearchParams({ q });
    const k = o.kdc ?? kdc;
    const s = o.sort ?? sort;
    if (k) p.set("kdc", k);
    if (s !== "relevance") p.set("sort", s);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    return `/search?${p.toString()}`;
  };

  return (
    <div>
      <Link prefetch={false} href="/">← 검색</Link>
      <h1>&apos;{q}&apos; 검색 결과</h1>
      <div className="meta">총 {result.total.toLocaleString("ko-KR")}건</div>
      <div className="chips">
        <Link prefetch={false} className={`chip ${kdc === "" ? "on" : ""}`} href={href({ kdc: "", page: 1 })}>전체</Link>
        {Object.entries(KDC).map(([k, name]) => (
          <Link prefetch={false} key={k} className={`chip ${kdc === k ? "on" : ""}`} href={href({ kdc: k, page: 1 })}>{name}</Link>
        ))}
      </div>
      <div className="chips">
        {SORTS.map(([s, name]) => (
          <Link prefetch={false} key={s} className={`chip ${sort === s ? "on" : ""}`} href={href({ sort: s, page: 1 })}>{name}</Link>
        ))}
      </div>
      <div data-testid="search-results" data-query={result.query}>
        <ul>
          {result.items.map((b) => (
            <li key={b.id}>
              <Link prefetch={false} className="row" href={`/books/${b.id}`} data-testid="result-item" data-book-id={b.id}>
                <img src={b.cover} alt={b.title} width={72} height={100} />
                <div>
                  <div><strong>{b.title}</strong></div>
                  {b.subtitle && <div className="meta">{b.subtitle}</div>}
                  <div className="meta">{b.authors.length ? b.authors.join(", ") : "저자 정보 없음"}</div>
                  <div className="meta">{[b.publisher, b.year].filter(Boolean).join(" · ")}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {result.items.length === 0 && <p>검색 결과가 없습니다.</p>}
      </div>
      <div className="pager">
        {page > 1 ? <Link prefetch={false} href={href({ page: page - 1 })}>이전</Link> : <span />}
        <span className="meta">{page} / {lastPage}</span>
        {page < lastPage ? <Link prefetch={false} href={href({ page: page + 1 })}>다음</Link> : <span />}
      </div>
      {diag && <DiagLoader kind="search" data={diag} />}
    </div>
  );
}
