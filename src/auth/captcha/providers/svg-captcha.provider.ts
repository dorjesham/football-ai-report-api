import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as svgCaptcha from 'svg-captcha';
import { RedisService } from '../../../redis/redis.service';
import type {
  CaptchaProvider,
  RegisterCaptchaVerifyInput,
  SvgCaptchaChallenge,
} from '../captcha-provider.interface';

type CaptchaRecord = { answer: string; expiresAt: number };

const memoryStore = new Map<string, CaptchaRecord>();

@Injectable()
export class SvgCaptchaProvider implements CaptchaProvider {
  readonly name = 'svg' as const;
  private readonly log = new Logger(SvgCaptchaProvider.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private ttlSec(): number {
    return this.config.get<number>('authCaptchaTtlSeconds') ?? 300;
  }

  async createChallenge(): Promise<SvgCaptchaChallenge> {
    const captcha = svgCaptcha.create({
      size: 4,
      ignoreChars: '0oO1ilI',
      noise: 2,
      color: true,
      background: '#f4f4f5',
    });
    const captchaId = randomBytes(16).toString('hex');
    const answer = captcha.text.toLowerCase();
    const expiresAt = Date.now() + this.ttlSec() * 1000;
    await this.store(captchaId, answer, expiresAt);
    const svg = Buffer.from(captcha.data).toString('base64');
    return { provider: 'svg', captchaId, imageBase64: `data:image/svg+xml;base64,${svg}` };
  }

  private async store(captchaId: string, answer: string, expiresAt: number): Promise<void> {
    const key = `auth:captcha:${captchaId}`;
    if (this.redis.enabled) {
      await this.redis.setString(key, answer, this.ttlSec());
      return;
    }
    memoryStore.set(captchaId, { answer, expiresAt });
    this.log.warn('Captcha stored in memory (Redis disabled)');
  }

  async verify(input: RegisterCaptchaVerifyInput): Promise<void> {
    const id = input.captchaId?.trim();
    const answer = input.captchaCode?.trim().toLowerCase();
    if (!id || !answer) {
      throw new BadRequestException('captchaId and captchaCode are required');
    }
    const key = `auth:captcha:${id}`;
    let expected: string | null = null;
    if (this.redis.enabled) {
      expected = await this.redis.getString(key);
      if (expected) await this.redis.del(key);
    } else {
      const rec = memoryStore.get(id);
      if (rec && rec.expiresAt > Date.now()) {
        expected = rec.answer;
        memoryStore.delete(id);
      }
    }
    if (!expected || expected !== answer) {
      throw new BadRequestException('Invalid or expired captcha');
    }
  }
}
