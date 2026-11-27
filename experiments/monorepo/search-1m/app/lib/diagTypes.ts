// 서버와 클라이언트가 함께 쓰는 진단 데이터 형태 (node 의존성 없음)
export type DiagQuery = {
  label: string;
  token: string;
  waitMs: number; // pool.connect() 대기
  execMs: number; // 쿼리 실행
  rows: number;
};

export type DiagNote = { label: string; ms: number };

export type DiagData = {
  reqId: string;
  serverMs: number;
  queries: DiagQuery[];
  notes: DiagNote[];
};

export type ExplainSummary = {
  scans: string[];
  rowsRead: number;
  rowsReturned: number;
  sharedHit: number;
  sharedRead: number;
  executionMs: number | null;
  planningMs: number | null;
};
