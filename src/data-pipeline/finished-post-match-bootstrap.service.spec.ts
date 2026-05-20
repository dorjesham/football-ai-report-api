import { FinishedPostMatchBootstrapService } from './finished-post-match-bootstrap.service';

describe('FinishedPostMatchBootstrapService', () => {
  const prisma = {
    match: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const tracker = {
    progress: jest.fn(),
  };
  const config = {
    get: (key: string) => {
      const map: Record<string, number> = {
        finishedBootstrapLookbackDays: 90,
        finishedBootstrapBatchSize: 40,
        finishedBootstrapMaxRounds: 50,
        finishedBootstrapDelayMs: 800,
      };
      return map[key];
    },
  };

  const service = new FinishedPostMatchBootstrapService(
    prisma as never,
    config as never,
    tracker as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('dryRun counts candidates without processing matches', async () => {
    prisma.match.count.mockResolvedValue(120);

    const summary = await service.run('job-dry', {
      dryRun: true,
      batchSize: 40,
      maxRounds: 20,
    });

    expect(summary.dryRun).toBe(true);
    expect(summary.candidateTotal).toBe(120);
    expect(summary.processed).toBe(120);
    expect(prisma.match.findMany).not.toHaveBeenCalled();
    expect(tracker.progress).toHaveBeenCalledWith(
      'job-dry',
      100,
      '试跑完成（未写入数据）',
      expect.objectContaining({ dryRun: true }),
    );
  });

  it('caps dryRun processed by batchSize * maxRounds', async () => {
    prisma.match.count.mockResolvedValue(5000);

    const summary = await service.run('job-dry2', {
      dryRun: true,
      batchSize: 10,
      maxRounds: 3,
    });

    expect(summary.processed).toBe(30);
  });
});
