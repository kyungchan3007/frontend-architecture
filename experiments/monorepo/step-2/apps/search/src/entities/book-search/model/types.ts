import type { SearchResult } from "@/generated/api/types.gen";

// 생성 타입을 이 묶음의 모델로 다시 내보낸다 (화면은 generated를 직접 보지 않는다)
export type BookSearchResult = SearchResult;

// 검색 결과 또는 예상한 오류(백엔드 400의 메시지) (#86 ③-2)
export type BookSearchOutcome = { ok: true; result: BookSearchResult } | { ok: false; message: string };
