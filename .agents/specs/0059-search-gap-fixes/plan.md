# 계획

## 무엇을 · 왜
- #86: 2-3a(#85)에서 문서대로 만들고 측정하다 찾은 허점 4개를 하나씩 막는다
- 문서에 없는 부분이라 고치기 전에 공식 문서 근거를 먼저 찾고, 지금 코드에 어떻게 적용할지 이슈에 적는다

## 애매한 곳
- 순서: 1) 안 쓰는 /api/search 삭제 2) 검색어 정리 · 길이 제한 3) 백엔드 장애 시 error.tsx 4) 입력창을 주소에 맞추기 (확인됨)
- 1은 문서 예제처럼 고치지 않고 지운다. 쓰는 곳이 없기 때문 (확인됨)
- /api/books/[bookId]는 상세 화면이 아직 브라우저에서 부르므로 그대로 둔다 (확인됨)
- 2~4의 근거 문서는 각 단계 시작할 때 찾고, 고칠 방향은 문서에 맞춰 바꿀 수 있다 (확인됨)
- 커밋은 단계마다 내용을 먼저 보여 주고 확인받은 뒤에만 (확인됨)
- next dev · next build가 tsconfig에 넣는 줄은 이번 변경이 아니라 되돌린다 (가정)

## 파일 계획
- experiments/monorepo/step-2/apps/search/app/**
- experiments/monorepo/step-2/apps/search/src/_pages/**
- experiments/monorepo/step-2/apps/search/src/features/book-search/**
- .agents/specs/0059-search-gap-fixes/**

## 계획 밖 변경 이유

## 완료 기준
- [ ] bash .agents/checks.sh PASS
- [ ] 허점 4개마다 전 · 후 확인
- [ ] 검색 · 상세 동작이 이전과 같음

## 허점
- ①: /api/search를 지운 뒤 404를 기대했지만 200(HTML)이 나옴. 상세 화면용 app/[...slug]가 모든 주소를 받아 SPA 껍데기를 돌려줌. 백엔드까지는 가지 않음. 상세를 App Router로 옮겨 [...slug]가 없어질 때 다시 확인
