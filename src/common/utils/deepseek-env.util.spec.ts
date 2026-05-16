import { ConfigService } from '@nestjs/config';
import { shouldUseDeepseekMock } from './deepseek-env.util';

function mockConfig(partial: Record<string, unknown>): ConfigService {
  return {
    get: (k: string) => partial[k],
  } as unknown as ConfigService;
}

describe('shouldUseDeepseekMock', () => {
  it('true when API key missing', () => {
    expect(
      shouldUseDeepseekMock(
        mockConfig({ deepseekApiKey: '', enableMockDeepseek: false }),
      ),
    ).toBe(true);
    expect(
      shouldUseDeepseekMock(
        mockConfig({ deepseekApiKey: undefined, enableMockDeepseek: false }),
      ),
    ).toBe(true);
  });

  it('true when ENABLE_MOCK_DEEPSEEK=true even with key', () => {
    expect(
      shouldUseDeepseekMock(
        mockConfig({ deepseekApiKey: 'sk-test', enableMockDeepseek: true }),
      ),
    ).toBe(true);
  });

  it('false when key present and mock disabled', () => {
    expect(
      shouldUseDeepseekMock(
        mockConfig({ deepseekApiKey: 'sk-real', enableMockDeepseek: false }),
      ),
    ).toBe(false);
  });
});
