import { DataSourceType } from '@prisma/client';
import { MatchOddsSnapshotService } from './match-odds-snapshot.service';

describe('MatchOddsSnapshotService', () => {
  it('captureByMatchId upserts snapshot', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const matchUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      match: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'm1',
          externalId: 'af-f-100',
          afOddsSnapshot24At: null,
          afOddsSnapshot1At: null,
        }),
        update: matchUpdate,
      },
      matchOddsSnapshot: { upsert },
    };
    const api = {
      getOdds: jest.fn().mockResolvedValue({
        response: [{ fixture: { id: 100 }, bookmakers: [] }],
        raw: { response: [] },
      }),
    };
    const svc = new MatchOddsSnapshotService(prisma as never, api as never);
    const out = await svc.captureByMatchId('m1', 'T24');
    expect(out.skipped).toBe(false);
    expect(upsert).toHaveBeenCalled();
    const data = upsert.mock.calls[0][0];
    expect(data.create.provider).toBe(DataSourceType.API_FOOTBALL);
    expect(data.create.phase).toBe('T24');
  });
});
