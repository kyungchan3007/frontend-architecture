import http from "k6/http";
import exec from "k6/execution";
import { SharedArray } from "k6/data";
import { BASE_URL, REQUEST_PARAMS, buildOptions, handleSummary } from "./common.js";

const traffic = new SharedArray("search", () => JSON.parse(open("/bench/queries.json")).search);

export const options = buildOptions({
  group: ["many", "few", "author", "single", "none"],
  cond: ["basic", "filter", "sort", "deep"],
});

export function run() {
  const t = traffic[exec.scenario.iterationInTest % traffic.length];
  let url = `${BASE_URL}/api/search?q=${encodeURIComponent(t.q)}`;
  if (t.kdc) url += `&kdc=${t.kdc}`;
  if (t.sort) url += `&sort=${t.sort}`;
  if (t.page) url += `&page=${t.page}`;
  http.get(url, { ...REQUEST_PARAMS, tags: { group: t.g, cond: t.c, name: "search" } });
}

export { handleSummary };
