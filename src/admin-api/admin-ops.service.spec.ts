import { AdminOpsService } from './admin-ops.service';

describe('AdminOpsService', () => {
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(0) },
    match: { count: jest.fn().mockResolvedValue(0) },
    aiReport: { count: jest.fn().mockResolvedValue(0) },
    order: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ingestJobRun: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ingestJobItem: { findMany: jest.fn().mockResolvedValue([]) },
    tournament: { count: jest.fn().mockResolvedValue(1) },
    paymentUnlock: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const afQuota = {
    snapshot: jest.fn().mockResolvedValue({
      used: 100,
      limit: 1000,
      remaining: 900,
      date: '2026-05-19',
      redisEnabled: true,
    }),
  };

  const scheduledBootstrap = {
    coverage: jest.fn().mockResolvedValue({
      total: 10,
      missingSnapshot: 0,
      missingOdds: 0,
    }),
  };

  const finishedBootstrap = {
    coverage: jest.fn().mockResolvedValue({
      counts: { finishedTotal: 5, withFacts: 5 },
    }),
  };

  const liveCoverage = {
    coverage: jest.fn().mockResolvedValue({ items: [] }),
  };

  const svc = new AdminOpsService(
    prisma as never,
    afQuota as never,
    scheduledBootstrap as never,
    finishedBootstrap as never,
    liveCoverage as never,
  );

  it('getBootstrapStatus returns steps', async () => {
    prisma.ingestJobRun.findFirst = jest.fn().mockResolvedValue(null);
    const r = await svc.getBootstrapStatus();
    expect(r.steps).toHaveLength(5);
    expect(r.bootstrapStatus).toBeDefined();
  });

  it('getTodos includes manual spot check', async () => {
    const todos = await svc.getTodos();
    expect(todos.some((t) => t.id === 'manual-spot-check')).toBe(true);
  });
});
