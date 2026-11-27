// 인기도 분포로 뽑은 도서의 상세 HTML과 API 4개를 고르게 요청한다.
import http from "k6/http";
import exec from "k6/execution";
import { SharedArray } from "k6/data";
import { BASE_URL, REQUEST_PARAMS, buildOptions, handleSummary } from "./common.js";

const traffic = new SharedArray("detail", () => JSON.parse(open("/bench/queries.json")).detail);

export const options = buildOptions({ endpoint: ["html", "book", "reviews", "recommendations", "holding"] });

const PATHS = {
  html: (id) => `/books/${id}`,
  book: (id) => `/api/books/${id}`,
  reviews: (id) => `/api/books/${id}/reviews`,
  recommendations: (id) => `/api/books/${id}/recommendations`,
  holding: (id) => `/api/books/${id}/holding`,
};

export function run() {
  const t = traffic[exec.scenario.iterationInTest % traffic.length];
  http.get(`${BASE_URL}${PATHS[t.ep](t.id)}`, { ...REQUEST_PARAMS, tags: { endpoint: t.ep, name: t.ep } });
}

export { handleSummary };
