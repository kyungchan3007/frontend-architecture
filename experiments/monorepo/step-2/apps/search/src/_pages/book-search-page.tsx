import Link from "next/link";
import { BookSearchView, MAX_QUERY_LENGTH } from "@/features/book-search";
import { Toast } from "@/shared/ui/toast";
import { AppNav } from "@/widgets/app-nav";

// 검색 페이지는 서버 컴포넌트다. 주소의 검색어(?q=)를 받아 검색 화면에 넘긴다 (#81 2-3a)
// (Next.js 문서 page.js "searchParams": Promise라서 await 한다. 쓰면 요청 때 그리는 페이지가 된다)
// 결과는 검색 화면 안의 Suspense 경계에서 가져온다 (③)
// 주소의 값은 사용자가 바꿀 수 있으니 서버에서 다시 확인한다 (#86 ②-2, Data Security "Validating client input")
// - 같은 키가 두 번 오면 배열이 된다 (page.js: ?a=1&a=2 → { a: ['1', '2'] }) → 첫 값만 쓴다
// - 1000자를 넘으면 백엔드를 부르지 않고 토스트로 알린다. 돌아가기는 검색어 없는 / 로
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export async function BookSearchPage({ searchParams }: { searchParams: SearchParams }) {
  const { q: raw } = await searchParams;
  const q = (Array.isArray(raw) ? raw[0] : raw) ?? "";

  return (
    <>
      <AppNav />
      <h1 className="text-primary">도서 검색</h1>
      {q.length > MAX_QUERY_LENGTH ? (
        <Toast
          message={`검색어가 ${MAX_QUERY_LENGTH}자를 넘어 검색할 수 없습니다.`}
          action={<Link href="/">돌아가기</Link>}
        />
      ) : (
        <BookSearchView q={q} />
      )}
    </>
  );
}
