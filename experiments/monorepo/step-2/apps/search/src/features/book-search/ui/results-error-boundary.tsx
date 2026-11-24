"use client";

import { catchError, type ErrorInfo } from "next/error";

// 검색 결과 자리만 오류 화면으로 바꾸는 오류 경계 (#86 ③)
// 현업처럼 오류 화면 + 다시 시도. 메뉴 · 제목 · 검색창은 그대로 둬서 다른 검색어를 바로 넣을 수 있다
// (Next.js catchError: error.js 파일 대신 원하는 곳만 감싼다. retry()는 다시 가져와서 다시 그린다)
// 서버 오류 메시지는 운영에서 숨겨지므로(error.digest만 남음) 화면에는 정해진 문구만 보여 준다
function ResultsErrorFallback(_props: object, { retry }: ErrorInfo) {
  return (
    <div role="alert">
      <p>검색 결과를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>
      <button type="button" onClick={() => retry()}>
        다시 시도
      </button>
    </div>
  );
}

export const ResultsErrorBoundary = catchError(ResultsErrorFallback);
