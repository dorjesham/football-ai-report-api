import { LocalizationService } from './localization.service';
import { LocalizationSeedLoader } from './localization-seed.loader';
import { DeepseekService } from '../deepseek/deepseek.service';
import { ConfigService } from '@nestjs/config';

describe('LocalizationService', () => {
  const prisma = {
    entityTranslation: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    team: { findMany: jest.fn(), update: jest.fn() },
    player: { findMany: jest.fn(), update: jest.fn() },
  };

  const seeds = {
    getTeamSeed: jest.fn(),
    getPlayerSeed: jest.fn(),
    getCoachSeed: jest.fn(),
  } as unknown as LocalizationSeedLoader;

  const deepseek = {
    completeChatJson: jest.fn(),
  } as unknown as DeepseekService;

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'nodeEnv') return 'test';
      if (key === 'localizationLlmDraftMaxPerRun') return 5;
      return undefined;
    }),
  } as unknown as ConfigService;

  const svc = new LocalizationService(
    prisma as never,
    seeds,
    deepseek,
    config,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applySeedEntry skips locked translations', async () => {
    prisma.entityTranslation.findFirst.mockResolvedValue({ id: 'x', locked: true });
    await svc.applySeedEntry('team', { externalId: '1', nameCn: '曼联', nameEn: 'Man Utd' }, 't1');
    expect(prisma.entityTranslation.upsert).not.toHaveBeenCalled();
  });

  it('generateLlmDraftBatch skips locked rows', async () => {
    prisma.team.findMany.mockResolvedValue([
      { id: 't1', nameEn: 'Foo FC', nameCn: 'Foo FC', externalId: 'af-t-1' },
    ]);
    prisma.entityTranslation.findFirst.mockResolvedValue({ locked: true, status: 'approved' });
    const out = await svc.generateLlmDraftBatch({ entityTypes: ['team'], limit: 5 });
    expect(out.processed).toBe(0);
    expect(out.skipped).toBe(1);
    expect(deepseek.completeChatJson).not.toHaveBeenCalled();
  });

  it('generateLlmDraftBatch writes draft when missing', async () => {
    prisma.team.findMany.mockResolvedValue([
      { id: 't1', nameEn: 'Foo FC', nameCn: 'Foo FC', externalId: 'af-t-1' },
    ]);
    prisma.entityTranslation.findFirst.mockResolvedValue(null);
    prisma.entityTranslation.upsert.mockResolvedValue({ id: 'et1' });
    (deepseek.completeChatJson as jest.Mock).mockResolvedValue({
      nameCn: '富足球俱乐部',
      confidence: 0.9,
    });
    const out = await svc.generateLlmDraftBatch({ entityTypes: ['team'], limit: 5 });
    expect(out.processed).toBe(1);
    expect(prisma.entityTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'draft', source: 'llm' }),
      }),
    );
  });
});
