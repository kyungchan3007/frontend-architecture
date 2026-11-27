// 측정 도구 검증 전용 빈 앱. 지연과 실패율을 정해 두고 측정값이 그대로 나오는지 확인한다.
// 환경 변수: PORT, STUB_DELAY_MS, STUB_DETAIL_DELAY_MS, STUB_ERROR_RATE, STUB_CSR=1 (상세를 클라이언트에서 그림)
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 3100);
const DELAY = Number(process.env.STUB_DELAY_MS || 0);
const DETAIL_DELAY = Number(process.env.STUB_DETAIL_DELAY_MS || DELAY);
const ERROR_RATE = Number(process.env.STUB_ERROR_RATE || 0);
const CSR = process.env.STUB_CSR === "1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = (body) => `<!doctype html><meta charset="utf-8"><body>${body}</body>`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const TITLE = "측정 확인용 도서";

const HOME = page(`<input data-testid="search-input" autofocus><div id="list"></div><script>
const input=document.querySelector('[data-testid=search-input]');const list=document.getElementById('list');
input.addEventListener('input',async()=>{const q=input.value;const r=await fetch('/api/autocomplete?q='+encodeURIComponent(q));const b=await r.json();
if(input.value!==q)return;list.innerHTML='<ul data-testid="autocomplete-list"></ul>';list.firstChild.dataset.query=q;});
input.addEventListener('keydown',e=>{if(e.key==='Enter')location.href='/search?q='+encodeURIComponent(input.value)});
</script>`);

function searchPage(q) {
  const items = [1, 2, 3].map((n) => `<a data-testid="result-item" data-book-id="B${n}" href="/books/B${n}">결과 ${n}</a>`).join("");
  return page(`<div data-testid="search-results" data-query="${esc(q)}">${items}</div>`);
}

function detailPage(id) {
  if (CSR) return page(`<div id="root"></div><script>fetch('/api/books/${id}').then(r=>r.json()).then(b=>{document.getElementById('root').innerHTML='<h1 data-testid="book-title" data-book-id="${id}">'+b.title+'</h1>'})</script>`);
  return page(`<h1 data-testid="book-title" data-book-id="${id}">${TITLE}</h1>`);
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://stub");
  const send = (status, type, body) => {
    res.writeHead(status, { "Content-Type": type });
    res.end(body);
  };
  const json = (data) => send(200, "application/json", JSON.stringify(data));
  const path = url.pathname;
  const isDetail = path.startsWith("/books/") || path.startsWith("/api/books/");
  if (path !== "/") await wait(isDetail ? DETAIL_DELAY : DELAY);
  if (path.startsWith("/api/") && Math.random() < ERROR_RATE) return send(500, "text/plain", "stub error");
  if (path === "/") return send(200, "text/html", HOME);
  if (path === "/search") return send(200, "text/html", searchPage(url.searchParams.get("q") || ""));
  if (path === "/api/autocomplete") return json({ query: url.searchParams.get("q"), items: [] });
  if (path === "/api/search") return json({ items: [{ id: "B1" }], total: 1 });
  let m = path.match(/^\/books\/([^/]+)$/);
  if (m) return send(200, "text/html", detailPage(m[1]));
  m = path.match(/^\/api\/books\/([^/]+)(?:\/(reviews|recommendations|holding))?$/);
  if (m) return json(m[2] ? { items: [] } : { id: m[1], title: TITLE });
  return send(404, "text/plain", "not found");
}).listen(PORT, "0.0.0.0", () => console.log(`stub on ${PORT}`));
