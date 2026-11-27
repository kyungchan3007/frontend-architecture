// 상세 페이지의 초기 HTML에 핵심 내용이 있는지 JS 실행 없이 확인한다.
// 사용법: node bench/html-check.mjs URL 도서ID...   (제목은 /api/books/:id에서 읽는다)
const [base, ...ids] = process.argv.slice(2);
const AGENTS = { browser: "Mozilla/5.0", GPTBot: "GPTBot/1.2", ClaudeBot: "ClaudeBot/1.0", OAISearch: "OAI-SearchBot/1.0" };
let failed = 0;
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
for (const id of ids) {
  const book = await (await fetch(`${base}/api/books/${id}`)).json();
  for (const [name, ua] of Object.entries(AGENTS)) {
    const res = await fetch(`${base}/books/${id}`, { headers: { "User-Agent": ua } });
    const html = decode(await res.text());
    const ok = res.status === 200 && html.includes(book.title);
    if (!ok) failed++;
    console.log(`${ok ? "OK  " : "FAIL"} ${name} ${id} status=${res.status} title=${book.title}`);
  }
}
console.log(failed ? `실패 ${failed}건` : "모두 통과");
process.exit(failed ? 1 : 0);
