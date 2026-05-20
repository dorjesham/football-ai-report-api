import { ReportStatus } from '@prisma/client';
import { MatchDetailBffService } from './match-detail-bff.service';

describe('MatchDetailBffService PUBLISHED aiReports filter', () => {
  it('queries only PUBLISHED PRE_MATCH reports for detail-v2', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({ externalId: 'af-f-12345' })
      .mockResolvedValueOnce({
        id: 'm1',
        status: 'SCHEDULED',
        kickoffTime: new Date(),
        isFeatured: false,
        homeTeam: { id: 'h', nameCn: 'H', externalId: 'af-t-1' },
        awayTeam: { id: 'a', nameCn: 'A', externalId: 'af-t-2' },
        competition: { code: 'EPL' },
        season: { code: '2025' },
        tacticalScenarios: [],
        playerIntelligence: [],
        aiReports: [],
        oddsSnapshots: [],
        oddsLiveSnapshots: [],
      });

    const prisma = { match: { findUnique } };
    const paywall = {
      getMatchAccess: jest.fn().mockResolvedValue({
        isUnlocked: false,
        permissions: {
          predictions: false,
          odds: false,
          aiReports: true,
          tactics: false,
          playerIntel: false,
        },
      }),
      cacheTier: jest.fn().mockReturnValue('guest'),
      unlockPrice: jest.fn().mockReturnValue(0),
    };
    const bundleSvc = {
      getByMatchId: jest.fn().mockResolvedValue(null),
      buildCoverage: jest.fn().mockReturnValue({}),
    };
    const injuriesSvc = { forMatch: jest.fn().mockResolvedValue({ items: [] }) };
    const redis = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn() };
    const config = { get: jest.fn().mockReturnValue(true) };
    const afSync = {
      syncOnUserView: jest.fn().mockResolvedValue(undefined),
    };

    const svc = new MatchDetailBffService(
      prisma as never,
      paywall as never,
      bundleSvc as never,
      injuriesSvc as never,
      redis as never,
      config as never,
      afSync as never,
    );

    await svc.getDetailV2('m1', null);

    const detailCall = findUnique.mock.calls[1][0];
    expect(detailCall.include.aiReports.where).toEqual({
      reportType: 'PRE_MATCH',
      status: ReportStatus.PUBLISHED,
    });
  });

  it('does not expose DRAFT reports in paidModules when query returns empty', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({ externalId: 'af-f-1' })
      .mockResolvedValueOnce({
        id: 'm1',
        status: 'SCHEDULED',
        kickoffTime: new Date(),
        isFeatured: false,
        homeTeam: { id: 'h', nameCn: 'H', externalId: null },
        awayTeam: { id: 'a', nameCn: 'A', externalId: null },
        competition: null,
        season: null,
        tacticalScenarios: [],
        playerIntelligence: [],
        aiReports: [],
        oddsSnapshots: [],
        oddsLiveSnapshots: [],
      });

    const prisma = { match: { findUnique } };
    const paywall = {
      getMatchAccess: jest.fn().mockResolvedValue({
        isUnlocked: true,
        permissions: {
          predictions: true,
          odds: true,
          aiReports: true,
          tactics: true,
          playerIntel: true,
        },
      }),
      cacheTier: jest.fn().mockReturnValue('unlocked'),
      unlockPrice: jest.fn().mockReturnValue(0),
    };
    const bundleSvc = {
      getByMatchId: jest.fn().mockResolvedValue(null),
      buildCoverage: jest.fn().mockReturnValue({}),
    };
    const injuriesSvc = { forMatch: jest.fn().mockResolvedValue({ items: [] }) };
    const redis = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn() };
    const config = { get: jest.fn().mockReturnValue(false) };
    const afSync = {
      syncOnUserView: jest.fn().mockResolvedValue(undefined),
    };

    const svc = new MatchDetailBffService(
      prisma as never,
      paywall as never,
      bundleSvc as never,
      injuriesSvc as never,
      redis as never,
      config as never,
      afSync as never,
    );

    const out = (await svc.getDetailV2('m1', { id: 'u1', role: 'USER' } as never)) as {
      paidModules: { aiReports: { data: unknown; status: string } };
    };
    expect(out.paidModules.aiReports.status).toBe('missing');
    expect(out.paidModules.aiReports.data).toBeNull();
  });
});
