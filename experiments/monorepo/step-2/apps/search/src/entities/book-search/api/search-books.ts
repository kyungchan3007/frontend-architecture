import { searchBooks as searchBooksApi } from "@/generated/api/sdk.gen";
import type { BookSearchOutcome } from "../model/types";

// 서비스 함수: 검색어 · 분류는 인자로 받고, 응답 검사는 생성 코드(validator)가 한다
// 오류를 두 가지로 나눈다 (#86 ③-2, Next.js Error Handling)
// - 예상한 오류: 백엔드가 400(검색어가 잘못됨)을 주면 던지지 않고 값으로 돌려준다 → 화면이 토스트로 알림
// - 예상하지 못한 오류: 백엔드가 꺼짐 등은 그대로 던진다 → 결과 자리의 오류 경계가 받음 (③-1)
export async function searchBooks(q: string, category?: string): Promise<BookSearchOutcome> {
  const { data, error, response } = await searchBooksApi({ query: { q, category } });
  if (data) return { ok: true, result: data };
  if (response?.status === 400 && error) return { ok: false, message: error.message };
  throw error;
}
