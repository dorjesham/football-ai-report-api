#!/usr/bin/env node
/**
 * 轻量 HTTP 并发冒烟（无额外依赖，需 Node 18+ `fetch`）。
 *
 * 用法：
 *   API_BASE=http://127.0.0.1:3000 node scripts/concurrency-smoke.mjs
 *   node scripts/concurrency-smoke.mjs --base http://127.0.0.1:30998 --workers 30 --waves 20
 *
 * 环境变量（可被 CLI 覆盖）：
 *   API_BASE        默认 http://127.0.0.1:3000
 *   CONC_WORKERS    并发 worker 数，默认 25
 *   CONC_WAVES      波次数（每波同时发 workers 个请求），默认 15
 */

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return def;
}

const base = (arg('--base', process.env.API_BASE) || 'http://127.0.0.1:3000').replace(/\/$/, '');
const workers = Math.max(1, parseInt(arg('--workers', process.env.CONC_WORKERS) || '25', 10));
const waves = Math.max(1, parseInt(arg('--waves', process.env.CONC_WAVES) || '15', 10));

async function getJson(path) {
  const t0 = performance.now();
  const res = await fetch(`${base}${path}`);
  const ms = performance.now() - t0;
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, ms, body };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[idx];
}

async function resolveMatchId() {
  const r = await getJson('/matches');
  if (!r.ok) return null;
  const data = r.body?.data ?? r.body;
  const arr = Array.isArray(data) ? data : [];
  return arr[0]?.id ?? null;
}

async function oneRequest(path) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${base}${path}`);
    const ms = performance.now() - t0;
    const ok = res.ok;
    return { ok, status: res.status, ms, path, err: null };
  } catch (e) {
    const ms = performance.now() - t0;
    return {
      ok: false,
      status: 0,
      ms,
      path,
      err: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  console.log(`concurrency-smoke base=${base} workers=${workers} waves=${waves}`);
  const matchId = await resolveMatchId();
  if (!matchId) {
    console.error('WARN: GET /matches failed or empty; intel path will be skipped.');
  }

  const paths = ['/health', '/orders/pricing', '/tournaments'];
  if (matchId) paths.push(`/matches/${matchId}/intel`);

  let success = 0;
  let fail = 0;
  const latencies = [];
  const errors = [];

  for (let w = 0; w < waves; w++) {
    const batch = [];
    for (let i = 0; i < workers; i++) {
      const path = paths[(w + i) % paths.length];
      batch.push(oneRequest(path));
    }
    const results = await Promise.all(batch);
    for (const r of results) {
      latencies.push(r.ms);
      if (r.ok) success++;
      else {
        fail++;
        errors.push({ path: r.path, status: r.status, err: r.err });
      }
    }
  }

  const total = success + fail;
  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((a, b) => a + b, 0);

  console.log('\n--- 结果 ---');
  console.log(`总请求数: ${total}`);
  console.log(`成功: ${success}  失败: ${fail}  成功率: ${((100 * success) / total).toFixed(2)}%`);
  console.log(`延迟 ms — min: ${latencies[0]?.toFixed(1) ?? 'n/a'}  avg: ${(sum / latencies.length).toFixed(1)}  p95: ${percentile(latencies, 0.95).toFixed(1)}  max: ${latencies[latencies.length - 1]?.toFixed(1) ?? 'n/a'}`);

  const uniq = new Map();
  for (const e of errors) {
    const k = `${e.path}|${e.status}|${e.err || ''}`;
    uniq.set(k, (uniq.get(k) || 0) + 1);
  }
  if (uniq.size) {
    console.log('\n失败样本（去重计数）:');
    for (const [k, c] of uniq) console.log(`  ${c}x  ${k}`);
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
