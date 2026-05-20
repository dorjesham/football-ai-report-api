import { MatchStatus } from '@prisma/client';
import { PredictionService } from './prediction.service';

describe('PredictionService.lockFinishedPredictions', () => {
  const prisma = {
    match: {
      findMany: jest.fn(),
    },
    matchPrediction: {
      update: jest.fn(),
    },
  };

  const service = new PredictionService(
    prisma as never,
    { get: () => undefined } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('locks active predictions for finished matches', async () => {
    const kickoff = new Date('2024-05-01T15:00:00Z');
    prisma.match.findMany.mockResolvedValue([
      {
        id: 'm1',
        kickoffTime: kickoff,
        activePrediction: { id: 'p1', lockedAt: null },
      },
    ]);
    prisma.matchPrediction.update.mockResolvedValue({});

    const out = await service.lockFinishedPredictions({ matchIds: ['m1'] });

    expect(out.locked).toBe(1);
    expect(prisma.match.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: MatchStatus.FINISHED,
          id: { in: ['m1'] },
        }),
      }),
    );
    expect(prisma.matchPrediction.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { lockedAt: kickoff },
    });
  });

  it('skips already locked predictions', async () => {
    prisma.match.findMany.mockResolvedValue([
      {
        id: 'm2',
        kickoffTime: new Date(),
        activePrediction: { id: 'p2', lockedAt: new Date() },
      },
    ]);

    const out = await service.lockFinishedPredictions({ matchIds: ['m2'] });

    expect(out.locked).toBe(0);
    expect(prisma.matchPrediction.update).not.toHaveBeenCalled();
  });
});
