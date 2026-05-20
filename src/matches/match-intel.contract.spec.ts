import { MatchStatus, ReportStatus, UserRole } from '@prisma/client';
import type { AiReport } from '@prisma/client';
import { buildMatchIntelResponse, type MatchIntelRow } from './match-intel.mapper';
import { MatchesService } from './matches.service';

function snapshot(isHome: boolean) {
  return {
    isHome,
    leagueRank: isHome ? 1 : 2,
    points: 10,
    recentForm: 'WDL',
    goalsForAvg: 1.5,
    goalsAgainstAvg: 1.0,
    xgAvg: null,
    xgaAvg: null,
    attackRating: 50,
    defenseRating: 50,
    dataQuality: 'MODEL_ESTIMATED',
    dataSource: 'MODEL',
  };
}

function prediction() {
  return {
    homeWinProbability: 40,
    drawProbability: 30,
    awayWinProbability: 30,
    homeExpectedGoals: 1.2,
    awayExpectedGoals: 1.0,
    totalExpectedGoals: 2.2,
    totalGoalsTrend: '偏高',
    tempoIndex: 55,
    upsetIndex: 42,
    homeMatchPower: 72.5,
    awayMatchPower: 68.0,
    confidence: 72,
    dataQuality: 'MODEL_ESTIMATED',
    modelVersion: 'v1',
    factorBreakdown: {
      ols: {
        homeBaseTpr: 70.1,
        awayBaseTpr: 68.3,
        homeMatchPower: 72.5,
        awayMatchPower: 68.0,
      },
    },
    explanation: '演示',
    dataSource: 'MODEL',
    version: 1,
    lockedAt: null,
    predictionMarkets: null,
  };
}

function reportPartial(
  id: string,
  status: ReportStatus,
  freeSummary: string,
): Pick<
  AiReport,
  | 'id'
  | 'status'
  | 'freeSummary'
  | 'disclaimer'
  | 'modelName'
  | 'dashboardSummary'
  | 'historicalInsight'
  | 'refereeAnalysis'
  | 'weatherAnalysis'
  | 'expertVariables'
  | 'generatedAt'
  | 'publishedAt'
> {
  return {
    id,
    status,
    freeSummary,
    disclaimer: '免责声明',
    modelName: null,
    dashboardSummary: null,
    historicalInsight: null,
    refereeAnalysis: null,
    weatherAnalysis: null,
    expertVariables: null,
    generatedAt: new Date('2026-01-01T00:00:00Z'),
    publishedAt: status === ReportStatus.PUBLISHED ? new Date('2026-01-02T00:00:00Z') : null,
  };
}

function baseRow(aiReports: AiReport[]): MatchIntelRow {
  return {
    id: 'match-contract-1',
    status: MatchStatus.SCHEDULED,
    isFeatured: false,
    round: 'R10',
    stage: null,
    groupName: null,
    stadium: 'Test',
    city: 'London',
    country: null,
    kickoffTime: new Date('2026-07-15T18:00:00Z'),
    homeScore: null,
    awayScore: null,
    tournament: { nameCn: '英超' },
    competition: { nameCn: '英超联赛', code: 'PL' },
    season: { code: '2026' },
    homeTeam: { id: 'th', nameCn: '主队', nameEn: 'Home', logoUrl: null, powerRating: 71.2 },
    awayTeam: { id: 'ta', nameCn: '客队', nameEn: 'Away', logoUrl: null, powerRating: 69.0 },
    teamSnapshots: [snapshot(true), snapshot(false)],
    playerSnapshots: [],
    refereeSnapshot: null,
    weatherSnapshot: null,
    activePrediction: prediction(),
    playerIntelligence: [],
    tacticalScenarios: [],
    fantasyAdvice: null,
    headToHead: null,
    socialGuide: null,
    aiReports: aiReports as AiReport[],
  } as unknown as MatchIntelRow;
}

describe('buildMatchIntelResponse (MatchIntel 契约)', () => {
  const unlockPrice = {
    amountCents: 690,
    currency: 'CNY',
    display: '¥6.9',
    tier: 'standard' as const,
  };

  it('未解锁：paid 为 null，freeLayer 含 predictionPreview，无 detail', () => {
    const match = baseRow([
      reportPartial('r-pub', ReportStatus.PUBLISHED, '已发布摘要') as AiReport,
    ]);
    const out = buildMatchIntelResponse({
      match,
      isUnlocked: false,
      isAdminViewer: false,
      unlockPrice,
      freeSummary: '已发布摘要',
      disclaimer: 'D',
      report: match.aiReports[0],
    });
    expect(out.meta.isUnlocked).toBe(false);
    expect(out.meta.isAdminViewer).toBe(false);
    expect(out.paid).toBeNull();
    expect(out.freeLayer.predictionPreview).not.toBeNull();
    expect(out.freeLayer.predictionPreview?.homeWinProbability).toBe(40);
    // 本场战力：基础 TPR 取自 factorBreakdown.ols（勿用可能过期的 Team.powerRating）；单场战力与 preview 同源
    expect(out.teams.home.powerRating).toBe(70.1);
    expect(out.teams.away.powerRating).toBe(68.3);
    expect(out.teams.home.matchPower).toBe(72.5);
    expect(out.teams.away.matchPower).toBe(68.0);
  });

  it('无 ols 分项时 teams.powerRating 回退 Team 表；matchPower 仍来自预测', () => {
    const match = baseRow([
      reportPartial('r-pub', ReportStatus.PUBLISHED, '已发布摘要') as AiReport,
    ]);
    (match.activePrediction as { factorBreakdown: unknown }).factorBreakdown = {};
    const out = buildMatchIntelResponse({
      match,
      isUnlocked: false,
      isAdminViewer: false,
      unlockPrice,
      freeSummary: '已发布摘要',
      disclaimer: 'D',
      report: match.aiReports[0],
    });
    expect(out.teams.home.powerRating).toBe(71.2);
    expect(out.teams.away.powerRating).toBe(69.0);
    expect(out.teams.home.matchPower).toBe(72.5);
    expect(out.teams.away.matchPower).toBe(68.0);
  });

  it('已解锁：paid 非空且含 prediction detail', () => {
    const match = baseRow([]);
    const out = buildMatchIntelResponse({
      match,
      isUnlocked: true,
      isAdminViewer: false,
      unlockPrice,
      freeSummary: 'x',
      disclaimer: 'D',
      report: null,
    });
    expect(out.meta.isUnlocked).toBe(true);
    expect(out.paid).not.toBeNull();
    expect(out.paid?.dashboard.detail).not.toBeNull();
    expect(out.paid?.dashboard.detail?.modelVersion).toBe('v1');
  });

  it('管理员视角：isAdminViewer 为 true', () => {
    const match = baseRow([]);
    const out = buildMatchIntelResponse({
      match,
      isUnlocked: true,
      isAdminViewer: true,
      unlockPrice,
      freeSummary: 'admin',
      disclaimer: 'D',
      report: null,
    });
    expect(out.meta.isAdminViewer).toBe(true);
  });
});

describe('MatchesService.getMatchIntel / getMatchDetail (解锁契约)', () => {
  let prisma: {
    match: { findUnique: jest.Mock };
  };
  let unlock: { hasPaidUnlock: jest.Mock; canAccessPaidIntel: jest.Mock };
  let config: { get: jest.Mock };
  let redis: {
    getJson: jest.Mock;
    setJson: jest.Mock;
    del: jest.Mock;
    delPattern: jest.Mock;
  };
  let matchCacheInvalidation: {
    invalidateAfterMatchDataChange: jest.Mock;
  };
  let service: MatchesService;

  const published = {
    ...reportPartial('rp', ReportStatus.PUBLISHED, 'PubSum'),
    matchId: 'm1',
  } as AiReport;
  const draft = {
    ...reportPartial('rd', ReportStatus.DRAFT, 'DraftSum'),
    matchId: 'm1',
  } as AiReport;

  beforeEach(() => {
    prisma = {
      match: { findUnique: jest.fn() },
      matchAfRawBundle: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    unlock = { hasPaidUnlock: jest.fn(), canAccessPaidIntel: jest.fn() };
    unlock.canAccessPaidIntel.mockImplementation(async (uid: string | undefined, mid: string) => {
      if (!uid) return false;
      return unlock.hasPaidUnlock(uid, mid);
    });
    config = {
      get: jest.fn((k: string) => {
        if (k === 'reportUnlockPriceCents') return 690;
        if (k === 'featuredReportUnlockPriceCents') return 990;
        if (k === 'cacheMatchIntelAnonTtlSec') return 15;
        if (k === 'cacheMatchIntelUserTtlSec') return 5;
        if (k === 'cacheMatchDetailAnonTtlSec') return 15;
        if (k === 'cacheMatchDetailUserTtlSec') return 5;
        return undefined;
      }),
    };
    redis = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(0),
    };
    matchCacheInvalidation = {
      invalidateAfterMatchDataChange: jest.fn().mockResolvedValue(undefined),
    };
    service = new MatchesService(
      prisma as never,
      config as never,
      unlock as never,
      { listForMatch: jest.fn() } as never,
      redis as never,
      matchCacheInvalidation as never,
      { forMatch: jest.fn() } as never,
      { generate: jest.fn() } as never,
    );
  });

  it('intel paid detail 无 predictionMarkets（v2 下线）', async () => {
    prisma.match.findUnique.mockResolvedValue(baseRow([published]));
    unlock.canAccessPaidIntel.mockResolvedValue(true);
    const r = await service.getMatchIntel('m1', {
      id: 'u1',
      openid: 'o1',
      role: UserRole.USER,
    });
    expect(r.paid?.dashboard.detail?.predictionMarkets).toBeNull();
    expect(r.paid?.dashboard.detail?.homeMatchPower).toBeNull();
  });

  it('未登录：未解锁，intel.paid 为 null', async () => {
    prisma.match.findUnique.mockResolvedValue(baseRow([published]));
    const r = await service.getMatchIntel('m1', null);
    expect(r.meta.isUnlocked).toBe(false);
    expect(r.paid).toBeNull();
    expect(r.freeLayer.freeSummary).toBe('PubSum');
  });

  it('已付费解锁：intel.paid 存在', async () => {
    prisma.match.findUnique.mockResolvedValue(baseRow([published]));
    unlock.canAccessPaidIntel.mockResolvedValue(true);
    const r = await service.getMatchIntel('m1', {
      id: 'u1',
      openid: 'o1',
      role: UserRole.USER,
    });
    expect(r.meta.isUnlocked).toBe(true);
    expect(r.paid).not.toBeNull();
    expect(unlock.canAccessPaidIntel).toHaveBeenCalledWith('u1', 'match-contract-1');
  });

  it('已注册 + 已完赛：未购买也视为已解锁，且不查 PaymentUnlock', async () => {
    const row = { ...baseRow([published]), status: MatchStatus.FINISHED };
    prisma.match.findUnique.mockResolvedValue(row);
    const r = await service.getMatchIntel('m1', {
      id: 'u1',
      openid: 'o1',
      role: UserRole.USER,
    });
    expect(r.meta.isUnlocked).toBe(true);
    expect(r.paid).not.toBeNull();
    expect(unlock.canAccessPaidIntel).not.toHaveBeenCalled();
  });

  it('已完赛但未登录：仍视为未解锁', async () => {
    const row = { ...baseRow([published]), status: MatchStatus.FINISHED };
    prisma.match.findUnique.mockResolvedValue(row);
    const r = await service.getMatchIntel('m1', null);
    expect(r.meta.isUnlocked).toBe(false);
    expect(r.paid).toBeNull();
  });

  it('管理员：优先草稿 freeSummary，且视为已解锁', async () => {
    prisma.match.findUnique.mockResolvedValue(baseRow([draft, published]));
    const r = await service.getMatchIntel('m1', {
      id: 'adm',
      openid: 'oa',
      role: UserRole.ADMIN,
    });
    expect(r.meta.isUnlocked).toBe(true);
    expect(r.meta.isAdminViewer).toBe(true);
    expect(r.freeLayer.freeSummary).toBe('DraftSum');
  });

  it('getMatchDetail 未解锁：paidContent 为 null 且 playerSnapshots 为空数组', async () => {
    prisma.match.findUnique.mockResolvedValue(baseRow([published]));
    const d = await service.getMatchDetail('m1', null);
    expect(d.isUnlocked).toBe(false);
    expect('paidContent' in d).toBe(true);
    if ('paidContent' in d) {
      expect(d.paidContent).toBeNull();
    }
    expect(d.playerSnapshots).toEqual([]);
  });

  it('getMatchDetail 已解锁：含 prediction 与 playerSnapshots', async () => {
    const row = baseRow([published]);
    (row as { playerSnapshots: unknown[] }).playerSnapshots = [
      { id: 'ps1', playerId: 'p1', matchId: 'm1' },
    ];
    prisma.match.findUnique.mockResolvedValue(row);
    unlock.canAccessPaidIntel.mockResolvedValue(true);
    const d = await service.getMatchDetail('m1', {
      id: 'u1',
      openid: 'o1',
      role: UserRole.USER,
    });
    expect(d.isUnlocked).toBe(true);
    expect('prediction' in d).toBe(true);
    if ('prediction' in d) {
      expect(d.prediction).toBeTruthy();
    }
    expect(Array.isArray(d.playerSnapshots)).toBe(true);
    expect((d.playerSnapshots as unknown[]).length).toBe(1);
  });

  it('getMatchDetail 已完赛 + 已注册：未购买也返回全量字段', async () => {
    const row = { ...baseRow([published]), status: MatchStatus.FINISHED };
    (row as { playerSnapshots: unknown[] }).playerSnapshots = [
      { id: 'ps1', playerId: 'p1', matchId: 'm1' },
    ];
    prisma.match.findUnique.mockResolvedValue(row);
    const d = await service.getMatchDetail('m1', {
      id: 'u1',
      openid: 'o1',
      role: UserRole.USER,
    });
    expect(d.isUnlocked).toBe(true);
    expect(unlock.canAccessPaidIntel).not.toHaveBeenCalled();
    expect('prediction' in d).toBe(true);
    expect((d.playerSnapshots as unknown[]).length).toBe(1);
  });
});
