import { ConfigService } from '@nestjs/config';
import { ApiFootballQuotaService } from './api-football-quota.service';
import { RedisService } from '../redis/redis.service';

describe('ApiFootballQuotaService', () => {
  const redis = {
    incrDaily: jest.fn(),
    getString: jest.fn(),
    enabled: true,
  } as unknown as RedisService;

  const config = {
    get: jest.fn((k: string) => {
      if (k === 'apiFootballDailyQuota') return 3;
      return undefined;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    (redis.incrDaily as jest.Mock).mockReset();
    (redis.getString as jest.Mock).mockResolvedValue(null);
  });

  it('tryConsume returns false when over limit', async () => {
    (redis.incrDaily as jest.Mock)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);
    const svc = new ApiFootballQuotaService(config, redis);
    expect(await svc.tryConsume()).toBe(true);
    expect(await svc.tryConsume()).toBe(false);
  });

  it('snapshot reads used count', async () => {
    (redis.getString as jest.Mock).mockResolvedValue('42');
    const svc = new ApiFootballQuotaService(config, redis);
    const snap = await svc.snapshot();
    expect(snap.used).toBe(42);
    expect(snap.limit).toBe(3);
    expect(snap.remaining).toBe(0);
  });
});
