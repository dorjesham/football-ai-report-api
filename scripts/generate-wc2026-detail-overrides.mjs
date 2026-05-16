/**
 * 根据 worldcup2026_teams.json 生成完整 wc2026_team_detail_overrides.json。
 * 保留现有文件中 MEX / ARG 的详细条目（若存在）。
 * 运行: node scripts/generate-wc2026-detail-overrides.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const teamsPath = path.join(root, 'worldcup2026_teams.json');
const outPath = path.join(root, 'wc2026_team_detail_overrides.json');

const confMap = {
  UEFA: '欧洲（UEFA）',
  CONMEBOL: '南美洲（CONMEBOL）',
  CONCACAF: '中北美及加勒比海（CONCACAF）',
  AFC: '亚洲（AFC）',
  CAF: '非洲（CAF）',
  OFC: '大洋洲（OFC）',
};

const hosts = new Set(['MEX', 'USA', 'CAN']);

const data = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
let preserved = {};
if (fs.existsSync(outPath)) {
  try {
    preserved = JSON.parse(fs.readFileSync(outPath, 'utf8')).byCode ?? {};
  } catch {
    preserved = {};
  }
}

const byCode = {};

for (const t of data.teams) {
  const code = t.code;
  if (preserved[code] && (code === 'MEX' || code === 'ARG')) {
    byCode[code] = preserved[code];
    continue;
  }

  const rd = confMap[t.confederation] ?? t.confederation;
  const qual = hosts.has(code)
    ? '联合东道主成员，直接晋级2026世界杯正赛。'
    : '通过洲际预选赛/附加赛获得2026世界杯正赛资格。';

  const wr = typeof t.fifaRanking?.worldRank === 'number' ? t.fifaRanking.worldRank : 40;
  const score = Math.round(92 - Math.min(Math.max(wr, 1), 50) * 0.65);

  byCode[code] = {
    marketingSummary: `${t.nameCn}，小组赛 ${t.group} 档，2026世界杯参赛队。`,
    aiInsight:
      '【AI推演】本段为赛前展示占位文案，随运营与数据迭代更新；不含未公开伤病与首发承诺，不构成赛果或投注建议。',
    contentVersion: '2026-05-06-gen',
    headCoachName: '待定',
    qualificationLabel: qual,
    regionDisplayName: rd,
    keyPlayers: [],
    tacticalTags: ['团队组织', '临场调整'],
    tacticalPitch: {
      kind: 'structured',
      zones: [],
      diagramUrl: null,
    },
    aiPowerScore: {
      value: Math.max(56, Math.min(93, score)),
      formulaId: 'wc_seed_rank_proxy.v1',
      asOf: '2026-05-06',
      note: '与 FIFA 公布名次相关的占位展示分；与 Elo、博彩模型无直接换算。',
    },
  };
}

const out = {
  schemaVersion: 1,
  contentNote:
    '由 scripts/generate-wc2026-detail-overrides.mjs 生成；可手工改 MEX/ARG 等队后勿被脚本覆盖（脚本会保留 MEX/ARG 原块）。其它队可改 founded / keyPlayers 等后执行 prisma db seed 合并入库。',
  byCode,
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('Wrote', outPath, 'teams', Object.keys(byCode).length);
