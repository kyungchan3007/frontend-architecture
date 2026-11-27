# 측정 도구와 앱의 약속

앱은 아래를 지켜야 측정할 수 있다. 측정 코드는 이 약속만 보고 앱 내부는 모른다.

## API

- `GET /api/autocomplete?q=`
- `GET /api/search?q=&kdc=&sort=&page=`
- `GET /api/books/:id`
- `GET /api/books/:id/reviews`
- `GET /api/books/:id/recommendations`
- `GET /api/books/:id/holding`

`/api/search`의 응답에는 `items: [{ id }]`가 있어야 한다.

## 화면 표시 지점

| 경로 | `data-testid` | 필수 속성 |
|---|---|---|
| `/` | `search-input` | - |
| 검색창 아래 | `autocomplete-list` | `data-query` |
| `/search?q=` | `search-results` | `data-query` |
| 검색 결과 항목 | `result-item` | `data-book-id` |
| `/books/:id` | `book-title` | `data-book-id` |

- `data-query`는 표시 중인 결과의 실제 검색어다. 이전 검색어의 결과가 남아 있으면 이전 값을 유지한다.
- `result-item`을 누르면 해당 도서의 상세로 이동한다.
- 검색창에서 Enter를 누르면 `/search?q=`로 이동한다.
- `book-title`은 도서 제목이 실제로 보일 때 나타난다. 로딩 틀에는 붙이지 않는다. 다만 목록 데이터로 제목을 먼저 표시하는 개선(D1)에서는 제목이 보이는 순간에 붙인다.
