import Link from "next/link";
import { searchBooks } from "@/entities/book-search";
import { BookCard } from "@/shared/ui/card";
import { Toast } from "@/shared/ui/toast";

// 검색 결과 목록. 서버에서 결과를 가져와 그리는 서버 컴포넌트다 (#81 2-3a ③)
// (Next.js Learn "Adding Search and Pagination": 데이터를 가져오는 부분을 따로 두고 Suspense로 감싼다)
// 백엔드가 400을 주면(예상한 오류) 결과 대신 토스트로 알린다 (#86 ③-2, 현업: 백엔드가 막으면 프론트가 토스트)
export async function BookSearchResults({ q }: { q: string }) {
  const outcome = await searchBooks(q);
  if (!outcome.ok) {
    return <Toast message={outcome.message} action={<Link href="/">돌아가기</Link>} />;
  }

  const { result } = outcome;
  return (
    <>
      <p data-testid="total">검색 결과 {result.total}건</p>
      {result.items.map((book) => (
        <BookCard key={book.id} book={book}>
          <Link href={`/books/${book.id}`}>상세 보기</Link>
        </BookCard>
      ))}
    </>
  );
}
