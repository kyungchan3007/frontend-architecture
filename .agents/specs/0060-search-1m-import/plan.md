# 계획

## 무엇을 · 왜
- #88 0단계: 로컬에만 있던 100만 건 검색 실험(book-search-bench)을 이 저장소 experiments/monorepo/search-1m 으로 가져온다
- 이후 단계(자동완성 · 검색 결과 · 몰릴 때 · 캐시)는 이 폴더에서 이슈 #88로 진행한다

## 애매한 곳
- 위치: experiments/monorepo/search-1m, step-2(pnpm · 터보)와 별개로 npm · Docker로 돌아간다 (확인됨)
- 커밋을 둘로 나눈다: ① 기준선(main) ② B1(전체 스캔) 결과 (확인됨)
- 100만 건 원본 data/*.jsonl · data/generated 는 커밋하지 않고 로컬에만 둔다 (확인됨)
- compose 이름을 book-search-bench 로 고정해 예전 DB 볼륨(100만 건)을 그대로 쓴다 (확인됨)
- 예전 SDD는 동결 그대로 두고, 새로 정하는 것은 results/decisions.md 에 적는다 (확인됨)
- 원래 book-search-bench 폴더는 옮긴 쪽 동작을 확인한 뒤 지울지 묻는다 (확인됨)
- DB에 B1 인덱스가 남아 있다. 기준선과 다르므로 다음 단계 시작 전에 b1_down.sql로 되돌린다 (가정)

## 파일 계획
- experiments/monorepo/search-1m/**
- .agents/specs/0060-search-1m-import/**

## 계획 밖 변경 이유

## 완료 기준
- [ ] bash .agents/checks.sh PASS
- [ ] 옮긴 폴더에서 DB · 앱 · 측정 도구 체크섬이 그대로 동작
- [ ] 커밋 두 개(기준선 · B1)

## 허점
-
