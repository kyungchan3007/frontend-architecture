# 계획

## 무엇을 · 왜
- #86: 2-3a(#85)에서 문서대로 만들고 측정하다 찾은 허점 4개를 하나씩 막는다
- 문서에 없는 부분이라 고치기 전에 공식 문서 근거를 먼저 찾고, 지금 코드에 어떻게 적용할지 이슈에 적는다

## 애매한 곳
- 순서: 1) 안 쓰는 /api/search 삭제 2) 검색어 정리 · 길이 제한 3) 백엔드 장애 시 error.tsx 4) 입력창을 주소에 맞추기 (확인됨)
- 1은 문서 예제처럼 고치지 않고 지운다. 쓰는 곳이 없기 때문 (확인됨)
- /api/books/[bookId]는 상세 화면이 아직 브라우저에서 부르므로 그대로 둔다 (확인됨)
- 2~4의 근거 문서는 각 단계 시작할 때 찾고, 고칠 방향은 문서에 맞춰 바꿀 수 있다 (확인됨)
- ②는 현업처럼 세 곳에서 막는다: ②-1 입력창 maxLength 1000 + 안내, ②-2 Next 서버, ②-3 백엔드 (확인됨)
- ②-2: 1000자를 넘으면 자르지 않고 검색하지 않음, 토스트 + 돌아가기 버튼(/) (확인됨: 검색 안 하고 토스트, 돌아가기 버튼)
- ②-3: 백엔드는 1000자를 넘으면 400 + 메시지, 명세(search.yaml)에도 maxLength 1000 · 400 응답을 적고 생성 코드를 다시 만든다 (확인됨: 400, 명세도)
- ③: 현업처럼 오류 화면 + 다시 시도. 결과 목록만 catchError로 감싸 메뉴 · 검색창은 남긴다 (확인됨: 오류 화면+다시 시도, B 결과 목록만). 백엔드 400 토스트는 ③ 안에서 커밋을 나눈다
- ④: key={q}는 입력하다 멈추면 입력창이 새로 만들어져 글자가 사라져서 버림(커밋 안 함). ④-1 바깥에서 이동했을 때만 입력창 맞추기, ④-2 포커스가 빠질 때 debounce flush (확인됨: A 해 본 뒤 B, flush)
- 커밋은 단계마다 내용을 먼저 보여 주고 확인받은 뒤에만 (확인됨)
- next dev · next build가 tsconfig에 넣는 줄은 이번 변경이 아니라 되돌린다 (가정)

## 파일 계획
- experiments/monorepo/step-2/apps/search/app/**
- experiments/monorepo/step-2/apps/search/src/_pages/**
- experiments/monorepo/step-2/apps/search/src/features/book-search/**
- experiments/monorepo/step-2/apps/search/src/shared/ui/toast/**
- experiments/monorepo/step-2/apps/backend/src/server.mjs
- experiments/monorepo/step-2/apps/search/openapi/search.yaml
- experiments/monorepo/step-2/apps/search/src/generated/api/**
- .agents/specs/0059-search-gap-fixes/**

## 계획 밖 변경 이유
- experiments/monorepo/step-2/apps/search/src/entities/book-search/** — ③-2에서 백엔드 400(예상한 오류)을 던지지 않고 값으로 돌려주려면 검색 서비스 함수와 반환 타입을 바꿔야 했다

## 완료 기준
- [x] bash .agents/checks.sh PASS
- [x] 허점 4개마다 전 · 후 확인
- [x] 검색 · 상세 동작이 이전과 같음

## 허점
- ①: /api/search를 지운 뒤 404를 기대했지만 200(HTML)이 나옴. 상세 화면용 app/[...slug]가 모든 주소를 받아 SPA 껍데기를 돌려줌. 백엔드까지는 가지 않음. 상세를 App Router로 옮겨 [...slug]가 없어질 때 다시 확인
- ②-2: 토스트 문구는 자바스크립트가 꺼지면 비어 보임 (alert는 나중에 넣은 내용만 읽어 줘서 화면이 뜬 뒤 넣음)
- ③-2: 실제 1000자 제한으로는 백엔드 400을 만들 수 없어(②-2 · 생성 코드 zod가 먼저 막음) 5자 제한 임시 복사본으로만 확인
- ④: key={q}를 쓰니 같은 부모 안의 결과 오류 경계(③-1)와 key가 겹쳐 동작하지 않았음 → 형제끼리 key가 겹치지 않게 이름을 붙여야 함
- ④-2: flush 때문에 메뉴를 빨리 누르면 검색 요청이 한 번 나가고, 뒤로 가기 하면 그 검색어로 돌아감. 처음 확인 때 메뉴를 두 번 눌러야 이동한 적이 한 번 있었음 (5번 반복에서는 재현 안 됨)
