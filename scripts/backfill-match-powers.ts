/**
 * 批量对已有比赛调用「生成预测」，以回填 OLS 战力字段：
 * Team/Player.powerRating、MatchPrediction.homeMatchPower / awayMatchPower、factorBreakdown.ols 等。
 *
 * 依赖：与线上一致的 Admin JWT（`role === ADMIN`）。
 *
 * 用法:
 *   export ADMIN_JWT='eyJ...'   # 或写入 .env 的 ADMIN_JWT=
 *   export API_ORIGIN='http://127.0.0.1:3000'   # 可选，默认见下
 *   npm run powers:backfill
 *   npm run powers:backfill -- --take=50 --status=SCHEDULED
 *   npm run powers:backfill -- --match-id=<cuid>   # 单场
 *
 * 环境:
 *   DATABASE_URL（Prisma 枚举场次）
 *   API_ORIGIN（默认 http://127.0.0.1:3000；生产填 https://你的 API 根，勿尾斜杠）
 *   ADMIN_JWT（Bearer 内容，不含 `Bearer ` 前缀）
 */
import * as path from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import axios from 'axios';
import { PrismaClient, MatchStatus } from '@prisma/client';

dotenvConfig({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const o: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      o[k] = v ?? argv[++i] ?? '';
    }
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv);
  const token = process.env.ADMIN_JWT?.trim();
  const base = (process.env.API_ORIGIN || 'http://127.0.0.1:3000').replace(/\/$/, '');
  if (!token) {
    console.error('缺少 ADMIN_JWT（Admin 用户 JWT，不含 Bearer 前缀）');
    process.exit(1);
  }

  const singleId = args['match-id']?.trim();
  let ids: string[];
  if (singleId) {
    ids = [singleId];
  } else {
    const take = Math.min(2000, Math.max(1, parseInt(args.take || '500', 10) || 500));
    const statusRaw = args.status?.trim();
    const where =
      statusRaw && Object.values(MatchStatus).includes(statusRaw as MatchStatus) ?
        { status: statusRaw as MatchStatus }
      : {};
    const rows = await prisma.match.findMany({
      where,
      select: { id: true },
      orderBy: { kickoffTime: 'desc' },
      take,
    });
    ids = rows.map((r) => r.id);
  }

  console.log(`API ${base}，共 ${ids.length} 场，间隔 250ms…`);
  let ok = 0;
  let fail = 0;
  for (const id of ids) {
    try {
      const url = `${base}/matches/${encodeURIComponent(id)}/generate-prediction`;
      const res = await axios.post(url, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 120_000 });
      if (res.status >= 200 && res.status < 300) {
        ok++;
        process.stdout.write('.');
      } else {
        fail++;
        console.error(`\n${id} HTTP ${res.status}`);
      }
    } catch (e) {
      fail++;
      const msg = axios.isAxiosError(e) ? `${e.response?.status} ${JSON.stringify(e.response?.data)}` : String(e);
      console.error(`\n${id} ${msg}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`\n完成：成功 ${ok}，失败 ${fail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
