import {
  PrismaClient,
  UserRole,
  DataSourceType,
  MatchStatus,
} from '@prisma/client';
import { DEFAULT_TOURNAMENTS } from '../src/common/constants/default-tournaments';
import { importWorldCup2026Teams } from './import-wc2026-teams';
import { seedWc2026GroupStagePlaceholderMatches } from './seed-wc2026-matches';

/**
 * 种子依赖数据库结构已与 `prisma/schema.prisma` 对齐（含 User 海报/会员字段等）。
 * 若报「column does not exist」，请先在本环境执行：`npx prisma migrate deploy`
 * 再执行：`npx prisma db seed`（或一次性：`npm run db:setup`）。
 *
 * 会删除历史上旧版 `seed-match-1`…`seed-roll-*` 及 `seed-match-admin-showcase` 演示场次（若存在订单则先删解锁与订单再删比赛）。
 * 真实 FD/API-Football 同步场次默认无 enrich 数据，需在后台点「整场管线」或运行 `scripts/batch-pipeline-upcoming.ts`。
 * **五大联赛杯赛实例**（均含 FD `externalId` + `DataProviderMapping`）：`seed-comp-pl`/`pd`/`sa`/`bl1`/`fl1`（FD id：2021 / 2014 / 2019 / 2002 / 2015），便于赛程同步与入库对齐。
 */
const prisma = new PrismaClient();

/** 历史种子演示比赛（已不再写入，运行 seed 时清理） */
const LEGACY_DEMO_MATCH_IDS = [
  'seed-match-1',
  'seed-match-2',
  'seed-match-3',
  'seed-roll-pl-a',
  'seed-roll-pl-b',
  'seed-roll-cl-a',
  'seed-match-admin-showcase',
] as const;

async function removeLegacyDemoMatches() {
  await prisma.paymentUnlock.deleteMany({
    where: { matchId: { in: [...LEGACY_DEMO_MATCH_IDS] } },
  });
  await prisma.order.deleteMany({
    where: { matchId: { in: [...LEGACY_DEMO_MATCH_IDS] } },
  });
  const r = await prisma.match.deleteMany({
    where: { id: { in: [...LEGACY_DEMO_MATCH_IDS] } },
  });
  if (r.count > 0) {
    console.log(`Removed ${r.count} legacy demo match row(s).`);
  }
}

async function main() {
  await removeLegacyDemoMatches();

  const adminOpenid = process.env.ADMIN_BOOTSTRAP_OPENID || 'admin_bootstrap_openid';

  await prisma.user.upsert({
    where: { openid: adminOpenid },
    create: {
      openid: adminOpenid,
      nickname: 'Seed Admin',
      role: UserRole.ADMIN,
      membershipUntil: new Date(Date.now() + 86400000 * 400),
    },
    update: {
      role: UserRole.ADMIN,
      membershipUntil: new Date(Date.now() + 86400000 * 400),
    },
  });

  for (const row of DEFAULT_TOURNAMENTS) {
    await prisma.tournament.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        nameCn: row.nameCn,
        nameEn: row.nameEn,
        type: row.type,
        level: row.level,
        isGlobal: row.isGlobal ?? false,
        isActive: true,
      },
      update: {
        nameCn: row.nameCn,
        nameEn: row.nameEn,
        type: row.type,
        level: row.level,
        isGlobal: row.isGlobal ?? false,
      },
    });
  }

  const s2526 = await prisma.season.upsert({
    where: { code: '2025-2026' },
    create: { code: '2025-2026', name: '2025-2026', year: 2026, isCurrent: true },
    update: { isCurrent: true },
  });

  const pl = await prisma.tournament.findUniqueOrThrow({ where: { code: 'PL' } });
  const pd = await prisma.tournament.findUniqueOrThrow({ where: { code: 'PD' } });
  const sa = await prisma.tournament.findUniqueOrThrow({ where: { code: 'SA' } });
  const bl1 = await prisma.tournament.findUniqueOrThrow({ where: { code: 'BL1' } });
  const fl1 = await prisma.tournament.findUniqueOrThrow({ where: { code: 'FL1' } });
  const cl = await prisma.tournament.findUniqueOrThrow({ where: { code: 'UEFA_CL' } });
  const wc = await prisma.tournament.findUniqueOrThrow({ where: { code: 'FIFA_WC' } });

  /** football-data.org v4 competition.id，用于 FD 同步去重与赛程写入同一实例 */
  const FD_COMPETITION_ID_PL = '2021';
  const FD_COMPETITION_ID_PD = '2014';
  const FD_COMPETITION_ID_SA = '2019';
  const FD_COMPETITION_ID_BL1 = '2002';
  const FD_COMPETITION_ID_FL1 = '2015';

  /** FD 自动建过的实例可能与种子 externalId 冲突，先解除其他行的占用 */
  async function releaseCompetitionExternalId(externalId: string, keepId: string) {
    const other = await prisma.competition.findFirst({
      where: { externalId, NOT: { id: keepId } },
    });
    if (other) {
      await prisma.competition.update({
        where: { id: other.id },
        data: { externalId: null },
      });
      console.warn(
        `Seed: cleared duplicate Competition.externalId=${externalId} from row ${other.id} (reserved for ${keepId})`,
      );
    }
  }

  await releaseCompetitionExternalId(FD_COMPETITION_ID_PL, 'seed-comp-pl');
  await releaseCompetitionExternalId(FD_COMPETITION_ID_PD, 'seed-comp-pd');
  await releaseCompetitionExternalId(FD_COMPETITION_ID_SA, 'seed-comp-sa');
  await releaseCompetitionExternalId(FD_COMPETITION_ID_BL1, 'seed-comp-bl1');
  await releaseCompetitionExternalId(FD_COMPETITION_ID_FL1, 'seed-comp-fl1');

  const compPl = await prisma.competition.upsert({
    where: { id: 'seed-comp-pl' },
    create: {
      id: 'seed-comp-pl',
      tournamentId: pl.id,
      seasonId: s2526.id,
      code: 'PL',
      nameCn: '2025-2026 英超',
      nameEn: 'Premier League 2025-26',
      externalId: FD_COMPETITION_ID_PL,
      dataSource: DataSourceType.FOOTBALL_DATA,
    },
    update: {
      externalId: FD_COMPETITION_ID_PL,
      nameCn: '2025-2026 英超',
      nameEn: 'Premier League 2025-26',
    },
  });

  const compPd = await prisma.competition.upsert({
    where: { id: 'seed-comp-pd' },
    create: {
      id: 'seed-comp-pd',
      tournamentId: pd.id,
      seasonId: s2526.id,
      code: 'PD',
      nameCn: '2025-2026 西甲',
      nameEn: 'La Liga 2025-26',
      externalId: FD_COMPETITION_ID_PD,
      dataSource: DataSourceType.FOOTBALL_DATA,
    },
    update: {
      externalId: FD_COMPETITION_ID_PD,
      nameCn: '2025-2026 西甲',
      nameEn: 'La Liga 2025-26',
    },
  });

  const compSa = await prisma.competition.upsert({
    where: { id: 'seed-comp-sa' },
    create: {
      id: 'seed-comp-sa',
      tournamentId: sa.id,
      seasonId: s2526.id,
      code: 'SA',
      nameCn: '2025-2026 意甲',
      nameEn: 'Serie A 2025-26',
      externalId: FD_COMPETITION_ID_SA,
      dataSource: DataSourceType.FOOTBALL_DATA,
    },
    update: {
      externalId: FD_COMPETITION_ID_SA,
      nameCn: '2025-2026 意甲',
      nameEn: 'Serie A 2025-26',
    },
  });

  const compBl1 = await prisma.competition.upsert({
    where: { id: 'seed-comp-bl1' },
    create: {
      id: 'seed-comp-bl1',
      tournamentId: bl1.id,
      seasonId: s2526.id,
      code: 'BL1',
      nameCn: '2025-2026 德甲',
      nameEn: 'Bundesliga 2025-26',
      externalId: FD_COMPETITION_ID_BL1,
      dataSource: DataSourceType.FOOTBALL_DATA,
    },
    update: {
      externalId: FD_COMPETITION_ID_BL1,
      nameCn: '2025-2026 德甲',
      nameEn: 'Bundesliga 2025-26',
    },
  });

  const compFl1 = await prisma.competition.upsert({
    where: { id: 'seed-comp-fl1' },
    create: {
      id: 'seed-comp-fl1',
      tournamentId: fl1.id,
      seasonId: s2526.id,
      code: 'FL1',
      nameCn: '2025-2026 法甲',
      nameEn: 'Ligue 1 2025-26',
      externalId: FD_COMPETITION_ID_FL1,
      dataSource: DataSourceType.FOOTBALL_DATA,
    },
    update: {
      externalId: FD_COMPETITION_ID_FL1,
      nameCn: '2025-2026 法甲',
      nameEn: 'Ligue 1 2025-26',
    },
  });

  const compCl = await prisma.competition.upsert({
    where: { id: 'seed-comp-cl' },
    create: {
      id: 'seed-comp-cl',
      tournamentId: cl.id,
      seasonId: s2526.id,
      code: 'CL',
      nameCn: '2025-2026 欧冠',
      nameEn: 'UEFA CL 2025-26',
      dataSource: DataSourceType.FOOTBALL_DATA,
    },
    update: {},
  });

  await prisma.competition.upsert({
    where: { id: 'seed-comp-el' },
    create: {
      id: 'seed-comp-el',
      tournamentId: cl.id,
      seasonId: s2526.id,
      code: 'EL',
      nameCn: '2025-2026 欧联',
      nameEn: 'UEFA Europa League 2025-26',
      dataSource: DataSourceType.UNKNOWN,
    },
    update: {
      nameCn: '2025-2026 欧联',
      nameEn: 'UEFA Europa League 2025-26',
    },
  });

  await prisma.competition.upsert({
    where: { id: 'seed-comp-uecl' },
    create: {
      id: 'seed-comp-uecl',
      tournamentId: cl.id,
      seasonId: s2526.id,
      code: 'UECL',
      nameCn: '2025-2026 欧协联',
      nameEn: 'UEFA Conference League 2025-26',
      dataSource: DataSourceType.UNKNOWN,
    },
    update: {
      nameCn: '2025-2026 欧协联',
      nameEn: 'UEFA Conference League 2025-26',
    },
  });

  const compWc = await prisma.competition.upsert({
    where: { id: 'seed-comp-wc' },
    create: {
      id: 'seed-comp-wc',
      tournamentId: wc.id,
      seasonId: s2526.id,
      code: 'WC',
      nameCn: '2026 世界杯',
      nameEn: 'FIFA World Cup 2026',
      dataSource: DataSourceType.FOOTBALL_DATA,
    },
    update: {},
  });

  const wcSeed = await importWorldCup2026Teams(prisma, compWc.id);
  console.log(`World Cup 2026 teams (from worldcup2026_teams.json): ${wcSeed.upserted} upserted`);

  const wcMatches = await seedWc2026GroupStagePlaceholderMatches(prisma, {
    competitionId: compWc.id,
    tournamentId: wc.id,
    seasonId: s2526.id,
  });
  console.log(
    `World Cup 2026 placeholder group matches: ${wcMatches.matchesUpserted} upserted (competitionId=${compWc.id})`,
  );

  /** 与 football-data.org 官方 crest CDN id 对齐，便于后台展示队徽 */
  const teams = [
    ['seed-mci', '曼城', 'Manchester City FC', 'https://crests.football-data.org/65.png'],
    ['seed-ars', '阿森纳', 'Arsenal FC', 'https://crests.football-data.org/57.png'],
    ['seed-rma', '皇家马德里', 'Real Madrid CF', 'https://crests.football-data.org/86.png'],
    ['seed-bay', '拜仁慕尼黑', 'FC Bayern München', 'https://crests.football-data.org/5.png'],
    ['seed-fra', '法国', 'France', 'https://crests.football-data.org/773.svg'],
    ['seed-bra', '巴西', 'Brazil', 'https://crests.football-data.org/764.svg'],
    ['seed-che', '切尔西', 'Chelsea FC', 'https://crests.football-data.org/61.png'],
    ['seed-liv', '利物浦', 'Liverpool FC', 'https://crests.football-data.org/64.png'],
  ] as const;

  const teamRecords: Record<string, string> = {};
  for (const row of teams) {
    const id = row[0];
    const cn = row[1];
    const en = row[2];
    const logoUrl = row[3] ?? null;
    const t = await prisma.team.upsert({
      where: { id },
      create: {
        id,
        nameCn: cn,
        nameEn: en,
        logoUrl: logoUrl ?? undefined,
        eloRating: cn === '曼城' ? 2050 : cn === '皇家马德里' ? 2040 : 1980,
        dataSource: DataSourceType.MANUAL,
      },
      update: { nameCn: cn, nameEn: en, logoUrl: logoUrl ?? null },
    });
    teamRecords[cn] = t.id;
  }

  const players = [
    ['seed-p1', teamRecords['曼城']!, '哈兰德', 'Haaland'],
    ['seed-p2', teamRecords['曼城']!, '德布劳内', 'De Bruyne'],
    ['seed-p3', teamRecords['曼城']!, '福登', 'Foden'],
    ['seed-p4', teamRecords['阿森纳']!, '厄德高', 'Odegaard'],
    ['seed-p5', teamRecords['阿森纳']!, '赖斯', 'Rice'],
    ['seed-p6', teamRecords['阿森纳']!, '萨利巴', 'Saliba'],
    ['seed-p7', teamRecords['皇家马德里']!, '姆巴佩', 'Mbappe'],
    ['seed-p8', teamRecords['皇家马德里']!, '维尼修斯', 'Vinicius Jr'],
  ] as const;

  for (const [id, teamId, cn, en] of players) {
    await prisma.player.upsert({
      where: { id },
      create: {
        id,
        teamId,
        nameCn: cn,
        nameEn: en,
        dataSource: DataSourceType.MANUAL,
      },
      update: {},
    });
  }

  await prisma.dataProviderMapping.upsert({
    where: { id: 'seed-dpm-pl' },
    create: {
      id: 'seed-dpm-pl',
      provider: DataSourceType.FOOTBALL_DATA,
      tournamentId: pl.id,
      competitionId: compPl.id,
      providerCompetitionCode: 'PL',
      providerCompetitionId: FD_COMPETITION_ID_PL,
    },
    update: {
      competitionId: compPl.id,
      providerCompetitionCode: 'PL',
      providerCompetitionId: FD_COMPETITION_ID_PL,
    },
  });

  await prisma.dataProviderMapping.upsert({
    where: { id: 'seed-dpm-pd' },
    create: {
      id: 'seed-dpm-pd',
      provider: DataSourceType.FOOTBALL_DATA,
      tournamentId: pd.id,
      competitionId: compPd.id,
      providerCompetitionCode: 'PD',
      providerCompetitionId: FD_COMPETITION_ID_PD,
    },
    update: {
      competitionId: compPd.id,
      providerCompetitionCode: 'PD',
      providerCompetitionId: FD_COMPETITION_ID_PD,
    },
  });

  await prisma.dataProviderMapping.upsert({
    where: { id: 'seed-dpm-sa' },
    create: {
      id: 'seed-dpm-sa',
      provider: DataSourceType.FOOTBALL_DATA,
      tournamentId: sa.id,
      competitionId: compSa.id,
      providerCompetitionCode: 'SA',
      providerCompetitionId: FD_COMPETITION_ID_SA,
    },
    update: {
      competitionId: compSa.id,
      providerCompetitionCode: 'SA',
      providerCompetitionId: FD_COMPETITION_ID_SA,
    },
  });

  await prisma.dataProviderMapping.upsert({
    where: { id: 'seed-dpm-bl1' },
    create: {
      id: 'seed-dpm-bl1',
      provider: DataSourceType.FOOTBALL_DATA,
      tournamentId: bl1.id,
      competitionId: compBl1.id,
      providerCompetitionCode: 'BL1',
      providerCompetitionId: FD_COMPETITION_ID_BL1,
    },
    update: {
      competitionId: compBl1.id,
      providerCompetitionCode: 'BL1',
      providerCompetitionId: FD_COMPETITION_ID_BL1,
    },
  });

  await prisma.dataProviderMapping.upsert({
    where: { id: 'seed-dpm-fl1' },
    create: {
      id: 'seed-dpm-fl1',
      provider: DataSourceType.FOOTBALL_DATA,
      tournamentId: fl1.id,
      competitionId: compFl1.id,
      providerCompetitionCode: 'FL1',
      providerCompetitionId: FD_COMPETITION_ID_FL1,
    },
    update: {
      competitionId: compFl1.id,
      providerCompetitionCode: 'FL1',
      providerCompetitionId: FD_COMPETITION_ID_FL1,
    },
  });

  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
