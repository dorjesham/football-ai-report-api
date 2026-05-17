import { ConfigService } from '@nestjs/config';
import { CaptchaService } from './captcha.service';
import { GeetestCaptchaProvider } from './providers/geetest.provider';
import { SvgCaptchaProvider } from './providers/svg-captcha.provider';

describe('CaptchaService', () => {
  const svg = {} as SvgCaptchaProvider;
  const geetest = {} as GeetestCaptchaProvider;

  function svc(env: Record<string, string | undefined>) {
    const config = {
      get: (key: string) => {
        const map: Record<string, unknown> = {
          authCaptchaProvider: env.AUTH_CAPTCHA_PROVIDER,
          geetestId: env.GEETEST_ID,
        };
        return map[key];
      },
    } as ConfigService;
    return new CaptchaService(config, svg, geetest);
  }

  it('defaults to svg when no geetest id', () => {
    expect(svc({}).activeProvider()).toBe('svg');
  });

  it('uses geetest when GEETEST_ID is set', () => {
    expect(svc({ GEETEST_ID: 'abc' }).activeProvider()).toBe('geetest');
  });

  it('respects explicit AUTH_CAPTCHA_PROVIDER', () => {
    expect(svc({ AUTH_CAPTCHA_PROVIDER: 'svg', GEETEST_ID: 'x' }).activeProvider()).toBe('svg');
  });
});
