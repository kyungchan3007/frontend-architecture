import { createServer } from "node:http";
import { BOOKS, USERS } from "./data.mjs";

// 실험용 백엔드 (#81 2-2)
// 현업처럼 Next.js 서버(BFF)가 HTTP로 부르는 별도 서버. 가짜 응답(MSW) 대신 쓴다
// 현업 백엔드는 Java Spring이었지만, 실험의 초점은 프론트엔드 공통 모듈이라 간단하게 Node.js로 둔다
// 응답 모양은 OpenAPI 명세(packages/api/openapi/common.yaml · apps/search/openapi/search.yaml)를 따른다
const PORT = Number(process.env.PORT ?? 4000);
// 검색어 최대 길이 (search.yaml의 q maxLength와 같은 값, #86 ②-3)
const MAX_QUERY_LENGTH = 1000;

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;
  console.log(`${req.method} ${path}${url.search}`);

  if (req.method !== "GET") return json(res, 405, { message: "Method Not Allowed" });

  // 공통 명세
  if (path === "/api/books") return json(res, 200, BOOKS);
  let m = path.match(/^\/api\/books\/([^/]+)$/);
  if (m) {
    const book = BOOKS.find((b) => b.id === decodeURIComponent(m[1]));
    return book ? json(res, 200, book) : json(res, 404, { message: "Not Found" });
  }
  m = path.match(/^\/api\/users\/([^/]+)$/);
  if (m) {
    const user = USERS.find((u) => u.id === decodeURIComponent(m[1]));
    return user ? json(res, 200, user) : json(res, 404, { message: "Not Found" });
  }

  // 검색 앱 명세
  if (path === "/api/search") {
    const q = url.searchParams.get("q") ?? "";
    // 마지막 장치: Next 서버를 거치지 않고 직접 불러도 1000자를 넘으면 검색하지 않는다 (#86 ②-3, 명세 maxLength: 1000)
    // 요청 값이 잘못된 것이라 400 (MDN "400 Bad Request")
    if (q.length > MAX_QUERY_LENGTH) {
      console.log(`  → 400 검색어 ${q.length}자`);
      return json(res, 400, { message: `검색어는 ${MAX_QUERY_LENGTH}자까지 입력할 수 있습니다.` });
    }
    const category = url.searchParams.get("category");
    const items = BOOKS.filter((b) => b.title.includes(q) && (!category || b.category === category));
    return json(res, 200, { total: items.length, items });
  }

  return json(res, 404, { message: "Not Found" });
});

server.listen(PORT, () => {
  console.log(`backend: http://localhost:${PORT}`);
});
