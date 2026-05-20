import { ConfigService } from '@nestjs/config';
import { MatchIntelFreshnessService } from './match-intel-freshness.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MatchIntelFreshnessService', () => {
  it('computeIntelContentHash is stable for same inputs', async () => {
    const matchRow = {
      afRawBundle: {
        endpointHashes: { fixtureJson: 'aaa' },
        fixtureJson: { id: 1 },
      },
      teamSnapshots: [
        { isHome: true, contentHash: 'h1' },
        { isHome: false, contentHash: 'a1' },
      ],
      weatherSnapshot: { contentHash: 'w1' },
      activePrediction: { inputsHash: 'p1' },
      refereeSnapshot: null,
      matchFacts: null,
    };
    const prisma = {
      match: {
        findUnique: jest.fn().mockResolvedValue(matchRow),
        update: jest.fn(),
      },
      aiReport: { updateMany: jest.fn() },
    } as unknown as PrismaService;
    const config = { get: () => false } as unknown as ConfigService;
    const svc = new MatchIntelFreshnessService(prisma, config);
    const h1 = await svc.computeIntelContentHash('m1');
    const h2 = await svc.computeIntelContentHash('m1');
    expect(h1).toBe(h2);
    expect(h1.length).toBeGreaterThan(10);
  });
});
