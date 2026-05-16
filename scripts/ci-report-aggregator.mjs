#!/usr/bin/env node
/**
 * 读取 ci-l1-report.json，生成 ci-l1-summary.md
 * 用法: npm run ci:report
 */
import fs from 'fs';
import path from 'path';

const reportPath = path.join(process.cwd(), 'ci-l1-report.json');
const outPath = path.join(process.cwd(), 'ci-l1-summary.md');

if (!fs.existsSync(reportPath)) {
  console.warn('[ci:report] no ci-l1-report.json — skip');
  process.exit(0);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const lines = [
  '# CI L1 Summary',
  '',
  `| Field | Value |`,
  `|-------|-------|`,
  `| startedAt | ${report.startedAt ?? '—'} |`,
  `| finishedAt | ${report.finishedAt ?? '—'} |`,
  `| ciStrict | ${report.ciStrict ?? false} |`,
  `| ciRelease | ${report.ciRelease ?? false} |`,
  `| hasFail | ${report.hasFail ?? false} |`,
  `| hasWarning | ${report.hasWarning ?? false} |`,
  '',
  '## Steps',
  '',
  '| Script | Exit | Status |',
  '|--------|------|--------|',
];

for (const step of report.steps ?? []) {
  lines.push(`| ${step.script} | ${step.exitCode} | ${step.status} |`);
}

lines.push('', '## Details', '');

for (const step of report.steps ?? []) {
  lines.push(`### ${step.name}`, '');
  if (step.summary) {
    lines.push('```json', JSON.stringify(step.summary, null, 2), '```', '');
  }
  if (step.stderrTail) {
    lines.push('<details><summary>stderr</summary>', '', '```', step.stderrTail, '```', '</details>', '');
  }
}

fs.writeFileSync(outPath, lines.join('\n'));
console.log(`[ci:report] wrote ${outPath}`);

if (report.hasFail) {
  process.exit(1);
}
