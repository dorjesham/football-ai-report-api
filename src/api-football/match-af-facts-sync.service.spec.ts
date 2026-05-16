import { MatchStatus, DataSourceType } from '@prisma/client';
import { MatchAfFactsSyncService } from './match-af-facts-sync.service';

describe('MatchAfFactsSyncService', () => {
  const fixtureItem = {
    fixture: {
      id: 999,
      referee: 'Test Ref',
      venue: { name: 'Stadium' },
    },
    score: {
      halftime: { home: 1, away: 0 },
      fulltime: { home: 2, away: 1 },
    },
  };

  function buildSvc(overrides?: {
    match?: { id: string; externalId: string; status: MatchStatus };
    facts?: Record<string, unknown> | null;
  }) {
    const match = overrides?.match ?? {
      id: 'm1',
      externalId: 'af-f-999',
      status: MatchStatus.FINISHED,
    };
    const facts = overrides?.facts === undefined ? null : overrides.facts;

    const upsert = jest.fn().mockResolvedValue({});
    const matchUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      match: {
        findUnique: jest.fn().mockResolvedValue(match),
        update: matchUpdate,
      },
      matchFacts: {
        findUnique: jest.fn().mockResolvedValue(facts),
        upsert,
      },
      team: { findUnique: jest.fn().mockResolvedValue(null) },
      referee: { upsert: jest.fn().mockResolvedValue({ id: 'ref1' }) },
      refereeSnapshot: { upsert: jest.fn().mockResolvedValue({}) },
    };

    const api = {
      getFixtureById: jest.fn().mockResolvedValue({ item: fixtureItem, raw: {} }),
      getFixtureLineups: jest.fn().mockResolvedValue({ response: [{ team: { id: 1 } }], raw: {} }),
      getFixtureEvents: jest.fn().mockResolvedValue({ response: [{ type: 'Goal' }], raw: {} }),
      getFixtureStatistics: jest.fn().mockResolvedValue({ response: [{ team: { id: 1 } }], raw: {} }),
      sleep: jest.fn().mockResolvedValue(undefined),
    };

    const svc = new MatchAfFactsSyncService(prisma as never, api as never);
    return { svc, prisma, api, upsert, matchUpdate };
  }

  it('skips when FINISHED facts already complete', async () => {
    const { svc, api, upsert } = buildSvc({
      facts: {
        lineups: [{}],
        events: [{}],
        teamStats: [{}],
        afLastSyncedAt: new Date(),
        externalRefs: {},
      },
    });
    const out = await svc.syncByMatchId('m1');
    expect(out.detail.skipped).toBe(true);
    expect(api.getFixtureById).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('upserts MatchFacts with API_FOOTBALL provider when sync runs', async () => {
    const { svc, upsert } = buildSvc({ facts: null });
    const out = await svc.syncByMatchId('m1', { force: true });
    expect(out.detail.skipped).toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(1);
    const data = upsert.mock.calls[0][0];
    expect(data.create.primaryProvider).toBe(DataSourceType.API_FOOTBALL);
    expect(data.create.rawAfFixture).toBeDefined();
    expect(data.create.afLastSyncedAt).toBeInstanceOf(Date);
    expect(data.create.externalRefs.API_FOOTBALL).toBe('999');
  });
});
