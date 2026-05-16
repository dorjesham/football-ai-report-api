import {
  PrismaClient,
  UserRole,
  DataSourceType,
  MatchStatus,
  RiskLevel,
  ReportStatus,
} from '@prisma/client';
import { DEFAULT_TOURNAMENTS } from '../src/common/constants/default-tournaments';
import { importWorldCup2026Teams } from './import-wc2026-teams';
import { seedWc2026GroupStagePlaceholderMatches } from './seed-wc2026-matches';

/**
 * 种子依赖数据库结构已与 `prisma/schema.prisma` 对齐（含 User 海报/会员字段等）。
 * 若报「column does not exist」，请先在本环境执行：`npx prisma migrate deploy`
 * 再执行：`npx prisma db seed`（或一次性：`npm run db:setup`）。
 *
 * 会删除历史上旧版 `seed-match-1`…`seed-roll-*` 演示场次（若存在订单则先删解锁与订单再删比赛）。
 * 另会 **upsert 一条** `seed-match-admin-showcase`（曼城 vs 阿森纳）及关联快照/预测/AI 等，供后台「比赛详情」验收与联调；真实 FD 同步场次默认仍无 enrich 数据，需在后台点操作生成。
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
] as const;

/** 后台详情页验收用：单场 + 球队快照 / 天气 / 裁判 / 预测 / 球员数据 / AI 模块示例 */
const ADMIN_SHOWCASE_MATCH_ID = 'seed-match-admin-showcase';

async function ensureAdminShowcaseMatch(args: {
  competitionId: string;
  seasonId: string;
  tournamentId: string;
  homeTeamId: string;
  awayTeamId: string;
}) {
  const {
    competitionId,
    seasonId,
    tournamentId,
    homeTeamId,
    awayTeamId,
  } = args;
  const kickoffTime = new Date(Date.now() + 86400000 * 5);

  await prisma.match.upsert({
    where: { id: ADMIN_SHOWCASE_MATCH_ID },
    create: {
      id: ADMIN_SHOWCASE_MATCH_ID,
      externalId: 'seed-fd-showcase-001',
      competitionId,
      tournamentId,
      seasonId,
      homeTeamId,
      awayTeamId,
      kickoffTime,
      status: MatchStatus.SCHEDULED,
      dataSource: DataSourceType.MANUAL,
      stadium: '伊蒂哈德球场',
      city: '曼彻斯特',
      country: '英格兰',
      round: '种子场次 · 验收演示',
      isFeatured: true,
      reportStatus: ReportStatus.DRAFT,
      publicSourcesPhase48At: new Date(Date.now() - 86400000),
      publicSourcesPhase8At: new Date(Date.now() - 3600000),
    },
    update: {
      kickoffTime,
      stadium: '伊蒂哈德球场',
      city: '曼彻斯特',
      country: '英格兰',
      round: '种子场次 · 验收演示',
      isFeatured: true,
    },
  });

  await prisma.teamMatchSnapshot.upsert({
    where: {
      matchId_teamId: { matchId: ADMIN_SHOWCASE_MATCH_ID, teamId: homeTeamId },
    },
    create: {
      matchId: ADMIN_SHOWCASE_MATCH_ID,
      teamId: homeTeamId,
      isHome: true,
      leagueRank: 1,
      points: 52,
      recentForm: 'WWDLW',
      goalsForAvg: 2.2,
      goalsAgainstAvg: 0.9,
      xgAvg: 1.95,
      xgaAvg: 0.85,
      attackRating: 88,
      defenseRating: 82,
      fatigueIndex: 12,
      injuryImpact: 5,
      formation: '4-2-3-1',
      coachName: '瓜迪奥拉',
      coachStyle: '控球压迫',
      dataSource: DataSourceType.MANUAL,
    },
    update: {
      leagueRank: 1,
      points: 52,
      recentForm: 'WWDLW',
      goalsForAvg: 2.2,
      goalsAgainstAvg: 0.9,
    },
  });

  await prisma.teamMatchSnapshot.upsert({
    where: {
      matchId_teamId: { matchId: ADMIN_SHOWCASE_MATCH_ID, teamId: awayTeamId },
    },
    create: {
      matchId: ADMIN_SHOWCASE_MATCH_ID,
      teamId: awayTeamId,
      isHome: false,
      leagueRank: 3,
      points: 44,
      recentForm: 'WDWWL',
      goalsForAvg: 1.8,
      goalsAgainstAvg: 1.1,
      xgAvg: 1.65,
      xgaAvg: 1.05,
      attackRating: 84,
      defenseRating: 80,
      fatigueIndex: 18,
      injuryImpact: 8,
      formation: '4-3-3',
      coachName: '阿尔特塔',
      dataSource: DataSourceType.MANUAL,
    },
    update: {
      leagueRank: 3,
      points: 44,
      recentForm: 'WDWWL',
    },
  });

  await prisma.referee.upsert({
    where: { id: 'seed-referee-showcase' },
    create: {
      id: 'seed-referee-showcase',
      nameCn: '演示主裁',
      nameEn: 'Seed Referee',
      country: '英格兰',
      dataSource: DataSourceType.MANUAL,
    },
    update: { nameCn: '演示主裁' },
  });

  await prisma.refereeSnapshot.upsert({
    where: { matchId: ADMIN_SHOWCASE_MATCH_ID },
    create: {
      matchId: ADMIN_SHOWCASE_MATCH_ID,
      refereeId: 'seed-referee-showcase',
      matchesCount: 180,
      yellowCardsAvg: 3.8,
      redCardsAvg: 0.15,
      penaltiesAvg: 0.22,
      foulsAvg: 22,
      homeWinRate: 0.42,
      addedTimeAvg: 5.2,
      notes: '种子数据：场均出牌与补时示意。Phase B 联赛对照/裁判-队史请用 FD 同步写入，此处不编造 JSON。',
      dataSource: DataSourceType.MANUAL,
    },
    update: {
      yellowCardsAvg: 3.8,
    },
  });

  await prisma.weatherSnapshot.upsert({
    where: { matchId: ADMIN_SHOWCASE_MATCH_ID },
    create: {
      matchId: ADMIN_SHOWCASE_MATCH_ID,
      temperature: 11,
      condition: '多云',
      humidity: 72,
      windSpeed: 4.2,
      pitchCondition: '良好',
      source: 'seed',
      weatherImpactScore: 8,
      dataSource: DataSourceType.QWEATHER,
    },
    update: {
      temperature: 11,
      condition: '多云',
    },
  });

  await prisma.matchPrediction.upsert({
    where: { matchId: ADMIN_SHOWCASE_MATCH_ID },
    create: {
      matchId: ADMIN_SHOWCASE_MATCH_ID,
      homeWinProbability: 48,
      drawProbability: 27,
      awayWinProbability: 25,
      homeExpectedGoals: 1.85,
      awayExpectedGoals: 1.15,
      totalExpectedGoals: 3.0,
      totalGoalsTrend: '大球倾向中等',
      tempoIndex: 62,
      upsetIndex: 28,
      confidence: 71,
      modelVersion: 'seed-v1',
      explanation:
        '种子说明：主队主场 xG 占优，客队反击效率较高；此为固定文案用于后台详情展示验收。',
      dataSource: DataSourceType.MODEL,
    },
    update: { confidence: 71 },
  });

  const snapPlayers: { playerId: string; teamId: string }[] = [
    { playerId: 'seed-p1', teamId: homeTeamId },
    { playerId: 'seed-p2', teamId: homeTeamId },
    { playerId: 'seed-p4', teamId: awayTeamId },
  ];
  for (const sp of snapPlayers) {
    await prisma.playerMatchSnapshot.upsert({
      where: {
        matchId_playerId: {
          matchId: ADMIN_SHOWCASE_MATCH_ID,
          playerId: sp.playerId,
        },
      },
      create: {
        matchId: ADMIN_SHOWCASE_MATCH_ID,
        playerId: sp.playerId,
        teamId: sp.teamId,
        last5Goals: 3,
        last5Assists: 1,
        expectedStartProbability: 88,
        riskLevel: RiskLevel.LOW,
        injuryNote: '种子：无伤停疑云。',
        dataSource: DataSourceType.MANUAL,
      },
      update: { expectedStartProbability: 88 },
    });
  }

  await prisma.playerIntelligence.upsert({
    where: {
      matchId_playerId: {
        matchId: ADMIN_SHOWCASE_MATCH_ID,
        playerId: 'seed-p1',
      },
    },
    create: {
      matchId: ADMIN_SHOWCASE_MATCH_ID,
      playerId: 'seed-p1',
      teamId: homeTeamId,
      statusTag: '核心箭头',
      startProbability: 92,
      riskLevel: RiskLevel.LOW,
      aiSummary: '种子画像：中锋状态稳定，对抗与终结效率高。',
      fitnessAnalysis: '负荷正常，周中无国家队长途。',
      matchupAnalysis: '对位客队中卫速度略吃亏，可打身后。',
      dataSource: DataSourceType.DEEPSEEK,
    },
    update: { startProbability: 92 },
  });

  await prisma.tacticalScenario.deleteMany({
    where: { matchId: ADMIN_SHOWCASE_MATCH_ID },
  });
  await prisma.tacticalScenario.createMany({
    data: [
      {
        matchId: ADMIN_SHOWCASE_MATCH_ID,
        scenarioType: 'HIGH_PRESS',
        title: '主队高位逼抢开局',
        probability: 35,
        precondition: '客队后场出球节奏偏慢。',
        process: '前 20 分钟主队边锋内收压迫后腰接球点。',
        possibleScore: '2-0',
        dataSource: DataSourceType.DEEPSEEK,
      },
      {
        matchId: ADMIN_SHOWCASE_MATCH_ID,
        scenarioType: 'TRANSITION',
        title: '客队反击偷一个',
        probability: 22,
        precondition: '主队边后卫压上幅度大。',
        process: '断球后直塞边路，倒三角传中。',
        possibleScore: '1-1',
        dataSource: DataSourceType.DEEPSEEK,
      },
    ],
  });

  await prisma.fantasyAdvice.upsert({
    where: { matchId: ADMIN_SHOWCASE_MATCH_ID },
    create: {
      matchId: ADMIN_SHOWCASE_MATCH_ID,
      captainRecommendation: '种子建议：队长可优先考虑主队锋线核心。',
      mustHave: ['哈兰德', '德布劳内'],
      valuePicks: ['福登'],
      avoid: [],
      dataSource: DataSourceType.DEEPSEEK,
    },
    update: {},
  });

  await prisma.headToHeadInsight.upsert({
    where: { matchId: ADMIN_SHOWCASE_MATCH_ID },
    create: {
      matchId: ADMIN_SHOWCASE_MATCH_ID,
      lastMeetingsCount: 10,
      homeWins: 4,
      draws: 2,
      awayWins: 4,
      avgGoals: 2.8,
      summary:
        '种子交锋：近年互有胜负，主场球队略占优势；本段为固定验收文案。',
      dataSource: DataSourceType.MANUAL,
    },
    update: {},
  });

  await prisma.socialGuide.upsert({
    where: { matchId: ADMIN_SHOWCASE_MATCH_ID },
    create: {
      matchId: ADMIN_SHOWCASE_MATCH_ID,
      oneLiner: '英超焦点战：控球与转换的较量（种子）',
      shareCopy: '今晚曼城 vs 阿森纳，看点在中场绞杀与反击速度。#种子验收',
      posterTitle: '曼城 vs 阿森纳',
      dataSource: DataSourceType.DEEPSEEK,
    },
    update: { oneLiner: '英超焦点战：控球与转换的较量（种子）' },
  });

  await prisma.aiReport.deleteMany({
    where: { matchId: ADMIN_SHOWCASE_MATCH_ID },
  });
  await prisma.aiReport.create({
    data: {
      matchId: ADMIN_SHOWCASE_MATCH_ID,
      freeSummary:
        '【种子草稿】本场模型倾向主队小胜或平局；详细维度见后台各子模块。报告解锁前用户仅见本摘要。',
      disclaimer: '本报告为系统种子数据，不构成任何建议。',
      status: ReportStatus.DRAFT,
      modelName: 'seed',
    },
  });

  await prisma.sourceRecord.deleteMany({
    where: { matchId: ADMIN_SHOWCASE_MATCH_ID },
  });
  await prisma.sourceRecord.createMany({
    data: [
      {
        matchId: ADMIN_SHOWCASE_MATCH_ID,
        entityType: 'MATCH',
        entityId: ADMIN_SHOWCASE_MATCH_ID,
        sourceType: DataSourceType.MANUAL,
        sourceName: 'seed-overview',
        title: '种子来源记录',
      },
      {
        matchId: ADMIN_SHOWCASE_MATCH_ID,
        entityType: 'MATCH',
        entityId: ADMIN_SHOWCASE_MATCH_ID,
        sourceType: DataSourceType.WIKIPEDIA,
        sourceName: 'wiki-demo',
        sourceUrl: 'https://example.com',
      },
    ],
  });
}

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

  await ensureAdminShowcaseMatch({
    competitionId: compPl.id,
    seasonId: s2526.id,
    tournamentId: pl.id,
    homeTeamId: teamRecords['曼城']!,
    awayTeamId: teamRecords['阿森纳']!,
  });
  console.log(
    `Admin showcase match: /admin-view/matches/${ADMIN_SHOWCASE_MATCH_ID}`,
  );

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
