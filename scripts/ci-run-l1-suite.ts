/**
 * L1 验收套件：串行运行 npm 验收脚本，写入 ci-l1-report.json。
 * 用法: npm run ci:l1
 * 环境: DATABASE_URL 必填；CI_STRICT=1；CI_RELEASE=1 时 exit 2 也失败
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { isCiRelease } from './ci-strict.util';

const REPORT_PATH = path.join(process.cwd(), 'ci-l1-report.json');

const SCRIPTS: { name: string; script: string }[] = [
  { name: 'db-ping', script: 'db:ping' },
  { name: 'health-e2e', script: 'ci:health-e2e' },
  { name: 'prediction-backtest', script: 'prediction:backtest' },
  { name: 'live-sync-latency', script: 'live-sync:latency-report' },
  { name: 'report-fact-check', script: 'report:fact-check-sample' },
  { name: 'match-phase-smoke', script: 'match-phase:smoke' },
  { name: 'ops-af-cost', script: 'ops:af-cost-report' },
];

function runNpmScript(script: string): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', script], {
      cwd: process.cwd(),
      env: { ...process.env },
      shell: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

function tryParseLastJson(stdout: string): unknown {
  const lines = stdout.trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]!);
    } catch {
      /* continue */
    }
  }
  return null;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('[ci:l1] DATABASE_URL is required');
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const steps: Array<{
    name: string;
    script: string;
    exitCode: number;
    status: 'pass' | 'fail' | 'warning';
    summary?: unknown;
    stderrTail?: string;
  }> = [];

  let hasFail = false;
  let hasWarning = false;

  for (const { name, script } of SCRIPTS) {
    console.log(`\n[ci:l1] >>> npm run ${script}`);
    const { exitCode, stdout, stderr } = await runNpmScript(script);
    const summary = tryParseLastJson(stdout);
    let status: 'pass' | 'fail' | 'warning' = 'pass';

    if (exitCode === 1) {
      status = 'fail';
      hasFail = true;
    } else if (exitCode === 2) {
      if (isCiRelease()) {
        status = 'fail';
        hasFail = true;
      } else {
        status = 'warning';
        hasWarning = true;
      }
    } else if (exitCode !== 0) {
      status = 'fail';
      hasFail = true;
    }

    steps.push({
      name,
      script,
      exitCode,
      status,
      summary: summary ?? undefined,
      stderrTail: stderr ? stderr.slice(-500) : undefined,
    });
    process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  }

  const report = {
    schema: 'ci-l1-report-v1',
    startedAt,
    finishedAt: new Date().toISOString(),
    ciStrict: process.env.CI_STRICT === '1',
    ciRelease: isCiRelease(),
    steps,
    hasFail,
    hasWarning,
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n[ci:l1] wrote ${REPORT_PATH}`);

  if (hasFail) {
    process.exit(1);
  }
  if (hasWarning) {
    console.warn('[ci:l1] completed with warnings (exit 2 on some steps)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
