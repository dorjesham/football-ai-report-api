import type { Prisma, PrismaClient } from '@prisma/client';
import { MatchStatus } from '@prisma/client';

/** 展示顺序：五大联赛 → 欧冠 → 其他欧战 → 国家队/全球杯赛 → 次级 → 未关联 */
const TOURNAMENT_SORT_ORDER: string[] = [
  'PL',
  'PD',
  'SA',
  'BL1',
  'FL1',
  'UEFA_CL',
  'UEFA_EL',
  'UEFA_ECL',
  'UEFA_SUPER_CUP',
  'FIFA_WC',
  'FIFA_CWC',
  'UEFA_EURO',
  'COPA_AMERICA',
  'AFC_ASIAN_CUP',
  'AFCON',
  'INT_FRIENDLY',
  'EFL_CHAMPIONSHIP',
  'SEGUNDA',
  'SERIE_B',
  'BUNDESLIGA_2',
  'LIGUE_2',
];

function tournamentSortKey(code: string | null): number {
  if (!code) return 9000;
  const i = TOURNAMENT_SORT_ORDER.indexOf(code);
  return i >= 0 ? i : 8000 + code.charCodeAt(0);
}

export function summarizeProfileKeys(profile: Prisma.JsonValue | null | undefined): string[] {
  if (profile == null) return [];
  if (typeof profile !== 'object' || Array.isArray(profile)) return [];
  return Object.keys(profile as Record<string, unknown>).slice(0, 16);
}

export type CompetitionMatchRow = {
  competitionId: string;
  code: string | null;
  nameCn: string;
  nameEn: string;
  seasonCode: string | null;
  matchTotal: number;
  byStatus: Partial<Record<MatchStatus, number>>;
  finishedCount: number;
  footballDataCount: number;
  apiFootballCount: number;
  manualCount: number;
  worldfootballCount: number;
  withMatchFacts: number;
  /** 在该杯赛实例赛程中出现过的球队上的去重球员数 */
  playersOnRoster: number;
  /** 该杯赛下所有比赛的 PlayerMatchSnapshot 行数 */
  playerSnapshots: number;
  /** 该杯赛下所有比赛的 PlayerIntelligence 行数 */
  playerIntelligenceRows: number;
};

export type TournamentBucket = {
  tournamentCode: string | null;
  tournamentNameCn: string;
  tournamentNameEn: string;
  tournamentType: string;
  sortKey: number;
  competitions: CompetitionMatchRow[];
  subtotalMatches: number;
  subtotalFinished: number;
  subtotalWithFacts: number;
  /** 各杯赛 playersOnRoster 之和（同一球员跨多杯赛会重复计） */
  subtotalPlayersOnRosterSum: number;
  subtotalPlayerSnapshots: number;
  subtotalPlayerIntelligence: number;
};

/** API / 报表输出（不含内部排序键） */
export type TournamentBucketPublic = Omit<TournamentBucket, 'sortKey'>;

export type PlayerReportSampleRow = {
  id: string;
  nameCn: string;
  nameEn: string;
  position: string | null;
  shirtNumber: number | null;
  nationality: string | null;
  externalId: string | null;
  dataSource: string;
  teamNameCn: string;
  teamNameEn: string;
  hasProfileJson: boolean;
  profileFieldKeys: string[];
  updatedAt: string;
};

export type MatchDataOverview = {
  generatedAt: string;
  totals: {
    matches: number;
    finished: number;
    scheduled: number;
    live: number;
    otherStatus: number;
    withMatchFacts: number;
    footballDataMatches: number;
    apiFootballMatches: number;
    teams: number;
    players: number;
    competitions: number;
    ingestJobs: number;
    playersWithExternalId: number;
    playersWithProfileJson: number;
    playerMatchSnapshots: number;
    playerIntelligenceRows: number;
  };
  byTournament: TournamentBucketPublic[];
  playerData: {
    byDataSource: { source: string; count: number }[];
    byPosition: { position: string; count: number }[];
    recentSample: PlayerReportSampleRow[];
  };
};

export async function computeMatchDataOverview(prisma: PrismaClient): Promise<MatchDataOverview> {
  const [
    competitions,
    statusGroups,
    fdGroups,
    manualGroups,
    wfGroups,
    afGroups,
    factsByComp,
    totalsAgg,
    teamCount,
    playerCount,
    ingestCount,
    rosterByComp,
    snapshotsByComp,
    intelByComp,
    playerBySource,
    playerByPosition,
    extIdCount,
    profileCountRow,
    snapshotTotal,
    intelTotal,
    recentPlayers,
  ] = await Promise.all([
    prisma.competition.findMany({
      select: {
        id: true,
        code: true,
        nameCn: true,
        nameEn: true,
        tournament: {
          select: { code: true, nameCn: true, nameEn: true, type: true },
        },
        season: { select: { code: true } },
      },
    }),
    prisma.match.groupBy({
      by: ['competitionId', 'status'],
      _count: { id: true },
    }),
    prisma.match.groupBy({
      by: ['competitionId'],
      where: { dataSource: 'FOOTBALL_DATA' },
      _count: { id: true },
    }),
    prisma.match.groupBy({
      by: ['competitionId'],
      where: { dataSource: 'MANUAL' },
      _count: { id: true },
    }),
    prisma.match.groupBy({
      by: ['competitionId'],
      where: { dataSource: 'WORLDFOOTBALL' },
      _count: { id: true },
    }),
    prisma.match.groupBy({
      by: ['competitionId'],
      where: { dataSource: 'API_FOOTBALL' },
      _count: { id: true },
    }),
    prisma.$queryRaw<Array<{ competitionId: string; c: bigint }>>`
      SELECT m.\`competitionId\`, COUNT(*) AS c
      FROM \`MatchFacts\` mf
      INNER JOIN \`Match\` m ON mf.\`matchId\` = m.\`id\`
      GROUP BY m.\`competitionId\`
    `,
    prisma.match.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
    prisma.team.count(),
    prisma.player.count(),
    prisma.ingestJobRun.count(),
    prisma.$queryRaw<Array<{ competitionId: string; c: bigint }>>`
      SELECT m.\`competitionId\`, COUNT(DISTINCT p.\`id\`) AS c
      FROM \`Player\` p
      INNER JOIN \`Team\` t ON p.\`teamId\` = t.\`id\`
      INNER JOIN \`Match\` m ON m.\`homeTeamId\` = t.\`id\` OR m.\`awayTeamId\` = t.\`id\`
      GROUP BY m.\`competitionId\`
    `,
    prisma.$queryRaw<Array<{ competitionId: string; c: bigint }>>`
      SELECT m.\`competitionId\`, COUNT(*) AS c
      FROM \`PlayerMatchSnapshot\` pms
      INNER JOIN \`Match\` m ON pms.\`matchId\` = m.\`id\`
      GROUP BY m.\`competitionId\`
    `,
    prisma.$queryRaw<Array<{ competitionId: string; c: bigint }>>`
      SELECT m.\`competitionId\`, COUNT(*) AS c
      FROM \`PlayerIntelligence\` pi
      INNER JOIN \`Match\` m ON pi.\`matchId\` = m.\`id\`
      GROUP BY m.\`competitionId\`
    `,
    prisma.player.groupBy({
      by: ['dataSource'],
      _count: { _all: true },
    }),
    prisma.player.groupBy({
      by: ['position'],
      _count: { _all: true },
    }),
    prisma.player.count({
      where: { externalId: { not: null }, NOT: { externalId: '' } },
    }),
    prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) AS c FROM \`Player\` WHERE \`profile\` IS NOT NULL
    `,
    prisma.playerMatchSnapshot.count(),
    prisma.playerIntelligence.count(),
    prisma.player.findMany({
      take: 30,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        nameCn: true,
        nameEn: true,
        position: true,
        shirtNumber: true,
        nationality: true,
        externalId: true,
        dataSource: true,
        profile: true,
        updatedAt: true,
        team: { select: { nameCn: true, nameEn: true } },
      },
    }),
  ]);

  const statusMap = new Map<string, Partial<Record<MatchStatus, number>>>();
  for (const row of statusGroups) {
    const key = row.competitionId;
    if (!statusMap.has(key)) statusMap.set(key, {});
    const m = statusMap.get(key)!;
    m[row.status] = row._count.id;
  }

  const fdMap = new Map(fdGroups.map((r) => [r.competitionId, r._count.id]));
  const manualMap = new Map(manualGroups.map((r) => [r.competitionId, r._count.id]));
  const wfMap = new Map(wfGroups.map((r) => [r.competitionId, r._count.id]));
  const afMap = new Map(afGroups.map((r) => [r.competitionId, r._count.id]));
  const factsMap = new Map(
    factsByComp.map((r) => [r.competitionId, Number(r.c)]),
  );
  const rosterMap = new Map(rosterByComp.map((r) => [r.competitionId, Number(r.c)]));
  const snapMap = new Map(snapshotsByComp.map((r) => [r.competitionId, Number(r.c)]));
  const intelMap = new Map(intelByComp.map((r) => [r.competitionId, Number(r.c)]));

  const totalStatus = {
    finished: 0,
    scheduled: 0,
    live: 0,
    other: 0,
  };
  for (const row of totalsAgg) {
    if (row.status === 'FINISHED') totalStatus.finished += row._count.id;
    else if (row.status === 'SCHEDULED') totalStatus.scheduled += row._count.id;
    else if (row.status === 'LIVE') totalStatus.live += row._count.id;
    else totalStatus.other += row._count.id;
  }

  const compRows: CompetitionMatchRow[] = competitions.map((c) => {
    const byStatus = statusMap.get(c.id) ?? {};
    let matchTotal = 0;
    for (const n of Object.values(byStatus)) {
      matchTotal += n ?? 0;
    }
    const finishedCount = byStatus.FINISHED ?? 0;
    return {
      competitionId: c.id,
      code: c.code,
      nameCn: c.nameCn,
      nameEn: c.nameEn,
      seasonCode: c.season?.code ?? null,
      matchTotal,
      byStatus,
      finishedCount,
      footballDataCount: fdMap.get(c.id) ?? 0,
      apiFootballCount: afMap.get(c.id) ?? 0,
      manualCount: manualMap.get(c.id) ?? 0,
      worldfootballCount: wfMap.get(c.id) ?? 0,
      withMatchFacts: factsMap.get(c.id) ?? 0,
      playersOnRoster: rosterMap.get(c.id) ?? 0,
      playerSnapshots: snapMap.get(c.id) ?? 0,
      playerIntelligenceRows: intelMap.get(c.id) ?? 0,
    };
  });

  const bucketMap = new Map<string | null, TournamentBucket>();
  for (const row of compRows) {
    const comp = competitions.find((x) => x.id === row.competitionId)!;
    const tCode = comp.tournament?.code ?? null;
    const key = tCode ?? '__NONE__';
    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        tournamentCode: tCode,
        tournamentNameCn: comp.tournament?.nameCn ?? '（未关联赛事）',
        tournamentNameEn: comp.tournament?.nameEn ?? '—',
        tournamentType: comp.tournament?.type ?? 'OTHER',
        sortKey: tournamentSortKey(tCode),
        competitions: [],
        subtotalMatches: 0,
        subtotalFinished: 0,
        subtotalWithFacts: 0,
        subtotalPlayersOnRosterSum: 0,
        subtotalPlayerSnapshots: 0,
        subtotalPlayerIntelligence: 0,
      });
    }
    const b = bucketMap.get(key)!;
    b.competitions.push(row);
    b.subtotalMatches += row.matchTotal;
    b.subtotalFinished += row.finishedCount;
    b.subtotalWithFacts += row.withMatchFacts;
    b.subtotalPlayersOnRosterSum += row.playersOnRoster;
    b.subtotalPlayerSnapshots += row.playerSnapshots;
    b.subtotalPlayerIntelligence += row.playerIntelligenceRows;
  }

  for (const b of bucketMap.values()) {
    b.competitions.sort((a, x) => x.matchTotal - a.matchTotal || a.nameCn.localeCompare(x.nameCn));
  }

  const byTournamentSorted = [...bucketMap.values()].sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    return (a.tournamentCode || '').localeCompare(b.tournamentCode || '');
  });

  const byTournament = byTournamentSorted.map(({ sortKey: _sk, ...rest }) => rest);

  const totalMatches = compRows.reduce((s, r) => s + r.matchTotal, 0);
  const withFactsTotal = compRows.reduce((s, r) => s + r.withMatchFacts, 0);
  const fdTotal = compRows.reduce((s, r) => s + r.footballDataCount, 0);
  const afTotal = compRows.reduce((s, r) => s + r.apiFootballCount, 0);

  const byDataSource = [...playerBySource]
    .map((r) => ({ source: String(r.dataSource), count: r._count._all }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));

  const byPosition = [...playerByPosition]
    .map((r) => ({
      position: r.position === null || r.position === '' ? '（未填）' : r.position,
      count: r._count._all,
    }))
    .sort((a, b) => b.count - a.count || a.position.localeCompare(b.position));

  const recentSample: PlayerReportSampleRow[] = recentPlayers.map((p) => ({
    id: p.id,
    nameCn: p.nameCn,
    nameEn: p.nameEn,
    position: p.position ?? null,
    shirtNumber: p.shirtNumber ?? null,
    nationality: p.nationality ?? null,
    externalId: p.externalId ?? null,
    dataSource: p.dataSource,
    teamNameCn: p.team.nameCn,
    teamNameEn: p.team.nameEn,
    hasProfileJson: p.profile != null,
    profileFieldKeys: summarizeProfileKeys(p.profile),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      matches: totalMatches,
      finished: totalStatus.finished,
      scheduled: totalStatus.scheduled,
      live: totalStatus.live,
      otherStatus: totalStatus.other,
      withMatchFacts: withFactsTotal,
      footballDataMatches: fdTotal,
      apiFootballMatches: afTotal,
      teams: teamCount,
      players: playerCount,
      competitions: competitions.length,
      ingestJobs: ingestCount,
      playersWithExternalId: extIdCount,
      playersWithProfileJson: Number(profileCountRow[0]?.c ?? 0n),
      playerMatchSnapshots: snapshotTotal,
      playerIntelligenceRows: intelTotal,
    },
    byTournament,
    playerData: {
      byDataSource,
      byPosition,
      recentSample,
    },
  };
}
