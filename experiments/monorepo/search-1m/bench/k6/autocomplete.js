// 사용자 한 명이 검색어를 한 글자씩 입력하는 순서대로 요청한다. 글자 사이 간격은 120ms다.
// RATE는 초당 요청 수이므로, 평균 글자 수로 나눠 초당 입력 세션 수를 정한다.
import http from "k6/http";
import exec from "k6/execution";
import { sleep } from "k6";
import { SharedArray } from "k6/data";
import { BASE_URL, RATE, REQUEST_PARAMS, buildOptions, handleSummary } from "./common.js";

const traffic = new SharedArray("autocomplete", () => JSON.parse(open("/bench/queries.json")).autocomplete);
const AVG_LENGTH = 2.5;

export const options = buildOptions(
  { group: ["many", "few", "author", "single", "none"] },
  Math.max(1, Math.round(RATE / AVG_LENGTH)),
);

export function run() {
  const t = traffic[exec.scenario.iterationInTest % traffic.length];
  const chars = Array.from(t.q);
  for (let i = 1; i <= chars.length; i++) {
    const q = chars.slice(0, i).join("");
    http.get(`${BASE_URL}/api/autocomplete?q=${encodeURIComponent(q)}`, {
      ...REQUEST_PARAMS,
      tags: { group: t.g, name: "autocomplete" },
    });
    if (i < chars.length) sleep(0.12);
  }
}

export { handleSummary };
