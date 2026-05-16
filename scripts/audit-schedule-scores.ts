/**
 * 赛程/比分审计：将本地 Match 与 football-data.org 同场次对照（开球 UTC、比分、状态）。
 * 核心逻辑在 `src/football-data/schedule-audit.ts`。
 *
 * 用法:
 *   npm run audit:schedule
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/audit-schedule-scores.ts -- --competition-id seed-comp-wc --fd-code WC
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/audit-schedule-scores.ts -- --mode fd-external-id --competition-id <fd-synced-comp-id>
 *
 * 环境: DATABASE_URL, FOOTBALL_DATA_API_KEY, 可选 FOOTBALL_DATA_BASE_URL
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import {
  auditMatchesByFdExternalId,
  auditWcScheduleVsFootballData,
} from '../src/football-data/schedule-audit';

dotenvConfig({ path: path.join(__dirname, '..', '.env') });

function stripEnvQuotes(v: string | undefined): string | undefined {
  if (v == null || v === '') return v;
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function parseArgs(argv: string[]) {
  const o: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        o[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const k = a.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          o[k] = next;
          i++;
        } else {
          o[k] = 'true';
        }
      }
    }
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv);
  const mode = (args.mode || 'wc-pairs') as 'wc-pairs' | 'fd-external-id';
  const competitionId = args['competition-id'] || 'seed-comp-wc';
  const fdCode = args['fd-code'] || 'WC';
  const dateFrom = args['date-from'] || '2026-06-01';
  const dateTo = args['date-to'] || '2026-07-31';
  const kickoffToleranceMin = Number(args['kickoff-tolerance-min'] || '3');
  const outJson = args['out-json'] || '';

  const key = stripEnvQuotes(process.env.FOOTBALL_DATA_API_KEY) || '';
  const baseURL =
    stripEnvQuotes(process.env.FOOTBALL_DATA_BASE_URL) || 'https://api.football-data.org/v4';
  if (!key) {
    console.error('FOOTBALL_DATA_API_KEY is required for audit.');
    process.exit(1);
  }

  const dbUrl = stripEnvQuotes(process.env.DATABASE_URL);
  if (dbUrl) process.env.DATABASE_URL = dbUrl;

  const http = axios.create({
    baseURL,
    timeout: 30000,
    headers: { 'X-Auth-Token': key },
  });

  const prisma = new PrismaClient();
  try {
    let report: unknown;
    if (mode === 'fd-external-id') {
      report = await auditMatchesByFdExternalId({
        prisma,
        http,
        competitionId,
        kickoffToleranceMin,
      });
    } else {
      report = await auditWcScheduleVsFootballData({
        prisma,
        http,
        competitionId,
        fdCode,
        dateFrom,
        dateTo,
        kickoffToleranceMin,
      });
    }

    console.log(JSON.stringify(report, null, 2));

    if (outJson) {
      const p = path.isAbsolute(outJson) ? outJson : path.join(process.cwd(), outJson);
      fs.writeFileSync(p, JSON.stringify(report, null, 2), 'utf-8');
      console.error(`Wrote ${p}`);
    }

    if (args['fail-on-mismatch'] === 'true') {
      const r = report as { rows?: Array<{ note?: string }> };
      const bad = (r.rows || []).filter((x) => x.note && x.note !== 'OK').length;
      if (bad > 0) process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
