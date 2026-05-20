import { ConfigService } from '@nestjs/config';
import { DeepseekConcurrencyService } from './deepseek-concurrency.service';
import { DeepseekService } from './deepseek.service';

function mockConfig(partial: Record<string, unknown>): ConfigService {
  return {
    get: (k: string) => partial[k],
  } as unknown as ConfigService;
}

const passthroughLimiter: Pick<DeepseekConcurrencyService, 'runExclusive'> = {
  runExclusive: async <T>(fn: () => Promise<T>) => fn(),
};

describe('DeepseekService.smokePing', () => {
  it('returns mock mode without HTTP when key missing', async () => {
    const svc = new DeepseekService(
      mockConfig({ deepseekApiKey: '', enableMockDeepseek: false }),
      passthroughLimiter as DeepseekConcurrencyService,
    );
    const r = await svc.smokePing();
    expect(r.ok).toBe(true);
    expect(r.model).toBe('mock');
    expect(r.latencyMs).toBe(0);
  });

  it('returns mock mode when ENABLE_MOCK_DEEPSEEK=true', async () => {
    const svc = new DeepseekService(
      mockConfig({ deepseekApiKey: 'sk-x', enableMockDeepseek: true }),
      passthroughLimiter as DeepseekConcurrencyService,
    );
    const r = await svc.smokePing();
    expect(r.ok).toBe(true);
    expect(r.model).toBe('mock');
  });
});
