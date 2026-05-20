import { CompetitionsService } from './competitions.service';

describe('CompetitionsService.matchCounts', () => {
  it('joins competition metadata with groupBy counts', async () => {
    const prisma = {
      match: {
        groupBy: jest.fn().mockResolvedValue([
          { competitionId: 'seed-comp-pl', _count: { _all: 6 } },
        ]),
      },
      competition: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'seed-comp-pl', code: 'PL', nameCn: '英超', nameEn: 'Premier League' },
        ]),
      },
    };
    const svc = new CompetitionsService(prisma as never);
    const out = await svc.matchCounts({ status: undefined });
    expect(out.items).toEqual([
      {
        competitionId: 'seed-comp-pl',
        code: 'PL',
        nameCn: '英超',
        matchCount: 6,
      },
    ]);
  });
});
