import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CaptchaChallenge,
  CaptchaProviderName,
  RegisterCaptchaVerifyInput,
} from './captcha-provider.interface';
import { GeetestCaptchaProvider } from './providers/geetest.provider';
import { SvgCaptchaProvider } from './providers/svg-captcha.provider';

@Injectable()
export class CaptchaService {
  constructor(
    private readonly config: ConfigService,
    private readonly svg: SvgCaptchaProvider,
    private readonly geetest: GeetestCaptchaProvider,
  ) {}

  activeProvider(): CaptchaProviderName {
    const explicit = this.config.get<string>('authCaptchaProvider')?.trim().toLowerCase();
    if (explicit === 'geetest' || explicit === 'svg') {
      return explicit;
    }
    const geetestId = this.config.get<string>('geetestId');
    if (geetestId?.trim()) {
      return 'geetest';
    }
    return 'svg';
  }

  private provider() {
    return this.activeProvider() === 'geetest' ? this.geetest : this.svg;
  }

  createChallenge(): Promise<CaptchaChallenge> {
    return this.provider().createChallenge();
  }

  /** @deprecated use verifyRegisterCaptcha */
  async verify(captchaId: string, code: string, consume = true): Promise<void> {
    void consume;
    return this.verifyRegisterCaptcha({ captchaId, captchaCode: code });
  }

  async verifyRegisterCaptcha(input: RegisterCaptchaVerifyInput): Promise<void> {
    const provider = this.activeProvider();
    if (provider === 'svg') {
      if (!input.captchaCode?.trim()) {
        throw new BadRequestException('captchaCode is required for SVG captcha');
      }
      return this.svg.verify(input);
    }
    if (
      !input.lotNumber?.trim() ||
      !input.captchaOutput?.trim() ||
      !input.passToken?.trim() ||
      !input.genTime?.trim()
    ) {
      throw new BadRequestException(
        'lotNumber, captchaOutput, passToken and genTime are required for Geetest',
      );
    }
    return this.geetest.verify(input);
  }
}
