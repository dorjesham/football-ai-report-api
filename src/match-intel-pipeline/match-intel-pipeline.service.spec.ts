import { NotFoundException } from '@nestjs/common';
import { MatchIntelPipelineService } from './match-intel-pipeline.service';

describe('MatchIntelPipelineService', () => {
  it('比赛不存在时抛出 NotFoundException', async () => {
    const prisma = {
      match: { findUnique: jest.fn().mockResolvedValue(null) },
      matchPipelineRun: { create: jest.fn() },
    };
    const svc = new MatchIntelPipelineService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(svc.runFull('missing-id')).rejects.toThrow(NotFoundException);
    expect(prisma.matchPipelineRun.create).not.toHaveBeenCalled();
  });
});
