import DiagLoader from "@/components/DiagLoader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook, getRecommendations, getReviews } from "@/lib/books";
import { getHolding } from "@/lib/holding";
import { timed, withDiag } from "@/lib/diag";

export const dynamic = "force-dynamic";

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { value, diag } = await withDiag(async () => {
    const book = await getBook(id);
    if (!book) return null;
    const reviews = await getReviews(id);
    const recs = await getRecommendations(id);
    const holding = await timed("소장 상태(가짜 API 지연)", () => getHolding(id));
    return { book, reviews, recs, holding };
  });
  if (!value) notFound();
  const { book, reviews, recs, holding } = value;

    return (
    <div>
      <Link prefetch={false} href="/">← 검색</Link>
      <h1 data-testid="book-title" data-book-id={book.id}>{book.title}</h1>
      {book.subtitle && <div className="meta">{book.subtitle}</div>}
      <img className="big" src={book.cover} alt={book.title} width={160} height={224} />
      <div>{book.authors.length ? book.authors.join(", ") : "저자 정보 없음"}</div>
      <div className="meta">출판사: {book.publisher ?? "-"}</div>
      <div className="meta">연도: {book.year ?? "-"}</div>
      <div className="meta">분류: {book.kdc ?? "-"}</div>
      <div className="meta">ISBN: {book.isbn?.length ? book.isbn.join(", ") : "-"}</div>
      <div className="meta">소장 상태: {holding.status === "available" ? "대출 가능" : "대출 중"}</div>

      {book.description && (
        <>
          <h2>책 소개</h2>
          <pre>{book.description}</pre>
        </>
      )}
      {book.toc && (
        <>
          <h2>목차</h2>
          <pre>{book.toc}</pre>
        </>
      )}

      <h2>
        리뷰 {reviews.count.toLocaleString("ko-KR")}개
        {reviews.avg !== null && ` · 평균 ${reviews.avg.toFixed(1)}점`}
      </h2>
      {reviews.items.length === 0 && <p className="meta">아직 리뷰가 없습니다.</p>}
      {reviews.items.map((r) => (
        <div className="review" key={r.id}>
          <div>{"★".repeat(r.rating)} <span className="meta">{r.created_at.slice(0, 10)}</span></div>
          <div>{r.body}</div>
        </div>
      ))}

      <h2>추천 도서</h2>
      <div className="recs">
        {recs.items.map((r) => (
          <Link prefetch={false} key={r.id} href={`/books/${r.id}`}>
            <img src={r.cover} alt={r.title} width={96} height={134} />
            <div>{r.title}</div>
          </Link>
        ))}
      </div>
      {diag && <DiagLoader kind="detail" data={diag} />}
    </div>
  );
}
