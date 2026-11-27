// 세 시나리오가 공유하는 부하 설정. 예열 구간은 phase:warmup, 측정 구간은 phase:measure로 구분한다.
const RATE = Number(__ENV.RATE || 10);
const WARMUP = __ENV.WARMUP || "30s";
const DURATION = __ENV.DURATION || "2m";

export const BASE_URL = __ENV.BASE_URL || "http://web:3000";
export const REQUEST_PARAMS = { timeout: "10s" };

function scenario(rate, startTime, duration, phase, exec) {
  return {
    executor: "constant-arrival-rate",
    rate,
    timeUnit: "1s",
    duration,
    startTime,
    preAllocatedVUs: Math.max(20, rate * 2),
    maxVUs: 1000,
    gracefulStop: "10s",
    exec,
    tags: { phase },
  };
}

export function buildOptions(tagThresholds, sessionsPerSecond = RATE) {
  const scenarios = {
    measure: scenario(sessionsPerSecond, WARMUP === "0s" ? "0s" : WARMUP, DURATION, "measure", "run"),
  };
  if (WARMUP !== "0s") scenarios.warmup = scenario(sessionsPerSecond, "0s", WARMUP, "warmup", "run");

  const thresholds = {
    "http_req_duration{phase:measure}": ["max>=0"],
    "http_req_failed{phase:measure}": ["rate<=1"],
    "http_reqs{phase:measure}": ["count>=0"],
    "dropped_iterations{scenario:measure}": ["count>=0"],
  };
  for (const [tag, values] of Object.entries(tagThresholds)) {
    for (const value of values) {
      thresholds[`http_req_duration{phase:measure,${tag}:${value}}`] = ["max>=0"];
      thresholds[`http_req_failed{phase:measure,${tag}:${value}}`] = ["rate<=1"];
    }
  }
  return {
    scenarios,
    thresholds,
    summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max", "count"],
    discardResponseBodies: true,
  };
}

export function handleSummary(data) {
  return { [__ENV.OUT || "/out/summary.json"]: JSON.stringify(data) };
}

export { RATE };
