// 측정 실행기. 체크섬 확인 → 컨테이너 재시작 → 측정 → DB 지표 수집 → 원본 저장 순서로 돈다.
// 사용법:
//   node bench/run.mjs lock                     현재 bench/ 체크섬을 기준값으로 저장
//   node bench/run.mjs check                    기준값과 비교
//   node bench/run.mjs k6 --target search --label baseline [--rates 10,50,200] [--reps 3]
//        [--cache warm|cold] [--warmup 30s] [--duration 2m] [--base-url URL]
//   node bench/run.mjs browser --label baseline [--networks fast,slow] [--reps 3] [--flows 20] [--base-url URL]
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const BENCH = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(BENCH);
const LOCK = join(ROOT, "results", "bench.sha256");
const RAW = join(ROOT, "results", "raw");
const [command, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i > -1 ? rest[i + 1] : fallback;
};
const sh = (cmd, args, options = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf-8", ...options });
const compose = (...args) => sh("docker", ["compose", ...args]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function checksum() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === "node_modules" || name === ".DS_Store") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(BENCH);
  const hash = createHash("sha256");
  for (const f of files) hash.update(relative(ROOT, f)).update("\0").update(readFileSync(f)).update("\0");
  return hash.digest("hex");
}

function verifyLock() {
  if (!existsSync(LOCK)) throw new Error("체크섬 기준값이 없습니다. node bench/run.mjs lock 을 먼저 실행하세요.");
  const want = readFileSync(LOCK, "utf-8").trim();
  const got = checksum();
  if (want !== got) throw new Error(`bench/ 가 기준값과 다릅니다. want=${want} got=${got}`);
  return got;
}

const psql = (sql) => compose("exec", "-T", "db", "psql", "-U", "bench", "-d", "books", "-At", "-c", sql);

async function restartServices() {
  const running = compose("ps", "--services", "--status", "running").split("\n").filter(Boolean);
  const targets = ["db", "web", "redis"].filter((s) => running.includes(s));
  compose("restart", ...targets);
  compose("up", "-d", "--wait", ...targets);
  await sleep(2000);
}

function meta(extra) {
  let commit = null;
  try { commit = sh("git", ["rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
  return { at: new Date().toISOString(), bench_sha256: checksum(), commit, host_load_1m: loadavg()[0], ...extra };
}

function collectDb(dir, samples) {
  const stmt = psql(`SELECT coalesce(json_agg(t), '[]') FROM (SELECT left(query, 300) AS query, calls, round(total_exec_time::numeric, 1) AS total_ms,
    round(mean_exec_time::numeric, 2) AS mean_ms, rows, shared_blks_read, shared_blks_hit FROM pg_stat_statements
    WHERE query NOT ILIKE '%pg_stat%' ORDER BY total_exec_time DESC LIMIT 20) t`);
  writeFileSync(join(dir, "pg_stat_statements.json"), stmt);
  writeFileSync(join(dir, "pg_activity.json"), JSON.stringify(samples));
  const logs = compose("logs", "--no-color", "--since", "4m", "db");
  const slow = logs.split("\n").filter((l) => l.includes("duration:"));
  writeFileSync(join(dir, "slow_queries.log"), slow.slice(-500).join("\n"));
}

const sampleActivity = () => {
  const out = psql(`SELECT count(*) FILTER (WHERE state = 'active'), count(*) FILTER (WHERE wait_event_type = 'Lock'),
    count(*) FROM pg_stat_activity WHERE datname = 'books' AND pid <> pg_backend_pid()`).trim().split("|").map(Number);
  return { at: Date.now(), active: out[0], lock_wait: out[1], connections: out[2] };
};

function summarizeK6(file) {
  const m = JSON.parse(readFileSync(file, "utf-8")).metrics;
  const out = { requests: m["http_reqs{phase:measure}"]?.values.count ?? 0, dropped: m["dropped_iterations{scenario:measure}"]?.values.count ?? 0, tags: {} };
  for (const [name, metric] of Object.entries(m)) {
    if (!name.startsWith("http_req_duration{phase:measure")) continue;
    const label = name === "http_req_duration{phase:measure}" ? "all" : name.match(/phase:measure,(.*)}/)[1];
    const failed = m[name.replace("http_req_duration", "http_req_failed")]?.values.rate ?? 0;
    const v = metric.values;
    out.tags[label] = { med: v.med, p95: v["p(95)"], p99: v["p(99)"], max: v.max, count: v.count, error_rate: failed };
  }
  return out;
}

async function runK6() {
  const target = opt("target");
  if (!["autocomplete", "search", "detail"].includes(target)) throw new Error("--target autocomplete|search|detail");
  const label = opt("label");
  if (!label) throw new Error("--label 이 필요합니다");
  const cache = opt("cache", "warm");
  const rates = opt("rates", "10,50,200").split(",").map(Number);
  const reps = Number(opt("reps", 3));
  const warmup = cache === "cold" ? "0s" : opt("warmup", "30s");
  const duration = opt("duration", "2m");
  const baseUrl = opt("base-url", "http://web:3000");
  const sha = verifyLock();
  const results = [];
  for (const rate of rates) {
    for (let rep = 1; rep <= reps; rep++) {
      const dir = join(RAW, label, target, cache, `rps-${rate}`, `run-${rep}`);
      mkdirSync(dir, { recursive: true });
      await restartServices();
      psql("SELECT pg_stat_statements_reset()");
      const inner = `/out/${relative(RAW, dir)}/k6.json`;
      const k6 = spawn("docker", ["compose", "--profile", "bench", "run", "--rm", "-T",
        "-e", `RATE=${rate}`, "-e", `WARMUP=${warmup}`, "-e", `DURATION=${duration}`, "-e", `BASE_URL=${baseUrl}`, "-e", `OUT=${inner}`,
        "k6", "run", "--quiet", `/bench/k6/${target}.js`], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
      let log = "";
      k6.stdout.on("data", (d) => { log += d; });
      k6.stderr.on("data", (d) => { log += d; });
      const seconds = parseInt(warmup, 10) || 0;
      const samples = [];
      let resetDone = seconds === 0;
      const started = Date.now();
      const timer = setInterval(() => {
        try {
          if (!resetDone && Date.now() - started >= seconds * 1000) {
            psql("SELECT pg_stat_statements_reset()");
            resetDone = true;
          }
          samples.push(sampleActivity());
        } catch {}
      }, 5000);
      const code = await new Promise((r) => k6.on("close", r));
      clearInterval(timer);
      writeFileSync(join(dir, "k6.log"), log);
      if (code !== 0) throw new Error(`k6 실패 code=${code}\n${log.slice(-1500)}`);
      collectDb(dir, samples);
      const summary = summarizeK6(join(dir, "k6.json"));
      writeFileSync(join(dir, "meta.json"), JSON.stringify(meta({ target, rate, rep, cache, warmup, duration, baseUrl, bench_lock: sha }), null, 1));
      results.push({ rate, rep, ...summary });
      const a = summary.tags.all;
      console.log(`${target} ${cache} ${rate}rps run${rep}: p50=${a?.med?.toFixed(1)} p95=${a?.p95?.toFixed(1)} p99=${a?.p99?.toFixed(1)} err=${((a?.error_rate ?? 0) * 100).toFixed(2)}% reqs=${summary.requests} dropped=${summary.dropped}`);
    }
  }
  writeFileSync(join(RAW, label, target, cache, "summary.json"), JSON.stringify(results, null, 1));
}

async function runBrowser() {
  const label = opt("label");
  if (!label) throw new Error("--label 이 필요합니다");
  const networks = opt("networks", "fast,slow").split(",");
  const reps = Number(opt("reps", 3));
  const flows = opt("flows", "20");
  const baseUrl = opt("base-url", "http://localhost:3000");
  const sha = verifyLock();
  for (const network of networks) {
    for (let rep = 1; rep <= reps; rep++) {
      const dir = join(RAW, label, "browser", network, `run-${rep}`);
      mkdirSync(dir, { recursive: true });
      await restartServices();
      const out = sh("node", [join(BENCH, "playwright", "flow.mjs"), "--base-url", baseUrl, "--network", network, "--flows", flows, "--out", join(dir, "flow.json")], { maxBuffer: 1 << 24 });
      writeFileSync(join(dir, "meta.json"), JSON.stringify(meta({ network, rep, baseUrl, bench_lock: sha }), null, 1));
      console.log(`browser ${network} run${rep}: ${out.trim()}`);
    }
  }
}

if (command === "lock") {
  mkdirSync(dirname(LOCK), { recursive: true });
  writeFileSync(LOCK, checksum() + "\n");
  console.log("저장:", readFileSync(LOCK, "utf-8").trim());
} else if (command === "check") {
  console.log("일치:", verifyLock());
} else if (command === "k6") {
  await runK6();
} else if (command === "browser") {
  await runBrowser();
} else {
  console.error("lock | check | k6 | browser");
  process.exit(2);
}
