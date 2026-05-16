import { BadRequestException } from '@nestjs/common';
import { MatchStatus, ReportStatus, AiReportType } from '@prisma/client';
import { MatchPhaseService } from './match-phase.service';

describe('MatchPhaseService', () => {
  const baseMatch = {
    id: 'm1',
    status: MatchStatus.SCHEDULED,
    isFeatured: false,
    kickoffTime: new Date('2026-07-01T18:00:00Z'),
    homeScore: null,
    awayScore: null,
    stadium: 'S',
    city: 'C',
    country: null,
    round: null,
    stage: null,
    groupName: null,
    tournament: { nameCn: 'T' },
    competition: { nameCn: 'C', code: 'PL' },
    season: { code: '2026' },
    homeTeam: {
      id: 'h',
      nameCn: '主',
      nameEn: null,
      logoUrl: null,
      powerRating: 70,
    },
    awayTeam: {
      id: 'a',
      nameCn: '客',
      nameEn: null,
      logoUrl: null,
      powerRating: 68,
    },
    teamSnapshots: [],
    playerSnapshots: [],
    refereeSnapshot: null,
    weatherSnapshot: null,
    activePrediction: null,
    playerIntelligence: [],
    tacticalScenarios: [],
    fantasyAdvice: null,
    headToHead: null,
    socialGuide: null,
    aiReports: [],
  };

  function svc(overrides?: Partial<Record<string, unknown>>) {
    const prisma = {
      match: {
        findUnique: jest.fn(),
      },
    };
    const config = { get: jest.fn(() => 30) };
    const redis = { getJson: jest.fn(), setJson: jest.fn() };
    const unlock = { canAccessPaidIntel: jest.fn().mockResolvedValue(false) };
    const live = {
      getCachedOrBuild: jest.fn(),
      build: jest.fn(),
    };
    const oddsSnapshots = {
      listForMatch: jest.fn().mockResolvedValue({
        matchId: 'm1',
        snapshots: [],
        disclaimer: 'd',
      }),
    };
    const service = new MatchPhaseService(
      prisma as never,
      config as never,
      redis as never,
      unlock as never,
      live as never,
      oddsSnapshots as never,
    );
    return { service, prisma, live, ...overrides };
  }

  it('buildPreMatch returns match-phase-v1', async () => {
    const { service, prisma } = svc();
    prisma.match.findUnique.mockResolvedValue(baseMatch);
    const out = await service.buildPreMatch('m1', null);
    expect(out.schema).toBe('match-phase-v1');
    expect(out.phase).toBe('pre');
    expect(out.meta.recommendedPollSec).toBe(30);
  });

  it('buildPostMatch rejects non-FINISHED', async () => {
    const { service, prisma } = svc();
    prisma.match.findUnique.mockResolvedValue({
      ...baseMatch,
      status: MatchStatus.LIVE,
      matchFacts: null,
    });
    await expect(service.buildPostMatch('m1', null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('buildPostMatch returns post phase for FINISHED', async () => {
    const { service, prisma, live } = svc();
    prisma.match.findUnique.mockResolvedValue({
      ...baseMatch,
      status: MatchStatus.FINISHED,
      homeScore: 2,
      awayScore: 1,
      matchFacts: { events: { schema: 'match-events-v1', items: [] } },
      aiReports: [
        {
          id: 'r1',
          reportType: AiReportType.POST_MATCH,
          status: ReportStatus.PUBLISHED,
          freeSummary: '复盘',
          dashboardSummary: null,
          disclaimer: '免责声明',
          structuredContentJson: null,
        },
      ],
    });
    live.build.mockResolvedValue({
      keyMetrics: null,
      meta: { dataAvailability: { events: 'missing', teamStats: 'missing' } },
    });
    const out = await service.buildPostMatch('m1', { id: 'u1', role: 'USER' } as never);
    expect(out.phase).toBe('post');
    expect(out.narrative?.freeSummary).toBe('复盘');
  });
});
