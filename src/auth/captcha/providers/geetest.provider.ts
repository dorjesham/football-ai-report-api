import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac, randomBytes } from 'crypto';
import { RedisService } from '../../../redis/redis.service';
import type {
  CaptchaProvider,
  GeetestCaptchaChallenge,
  RegisterCaptchaVerifyInput,
} from '../captcha-provider.interface';

type GeetestRegisterData = {
  lot_number: string;
  captcha_type?: string;
  fail_count?: number;
  process_token?: string;
  payload?: string;
  payload_protocol?: string;
  pt?: string;
  challenge?: string;
};

const memRegister = new Map<string, { challenge: string; createdAt: number }>();

@Injectable()
export class GeetestCaptchaProvider implements CaptchaProvider {
  readonly name = 'geetest' as const;
  private readonly log = new Logger(GeetestCaptchaProvider.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private captchaIdConfig(): string {
    const id = this.config.get<string>('geetestId');
    if (!id) throw new BadRequestException('GEETEST_ID not configured');
    return id;
  }

  private captchaKey(): string {
    const key = this.config.get<string>('geetestKey');
    if (!key) throw new BadRequestException('GEETEST_KEY not configured');
    return key;
  }

  private apiServer(): string {
    return (
      this.config.get<string>('geetestApiServer')?.replace(/\/$/, '') ||
      'http://gcaptcha4.geetest.com'
    );
  }

  private ttlSec(): number {
    return this.config.get<number>('authCaptchaTtlSeconds') ?? 300;
  }

  async createChallenge(): Promise<GeetestCaptchaChallenge> {
    const geetestCaptchaId = this.captchaIdConfig();
    const challenge = randomBytes(16).toString('hex');
    const captchaId = randomBytes(16).toString('hex');

    const url = `${this.apiServer()}/register`;
    const { data } = await axios.get<{
      status?: string;
      data?: GeetestRegisterData;
      msg?: string;
    }>(url, {
      params: { captcha_id: geetestCaptchaId, challenge },
      timeout: 10000,
    });

    if (data.status !== 'success' || !data.data?.lot_number) {
      this.log.warn(`Geetest register failed: ${data.msg ?? 'unknown'}`);
      throw new BadRequestException('Captcha service unavailable');
    }

    const d = data.data;
    await this.storeSession(captchaId, challenge);
    return {
      provider: 'geetest',
      captchaId,
      lotNumber: d.lot_number,
      captchaType: d.captcha_type,
      failCount: d.fail_count,
      processToken: d.process_token,
      payload: d.payload,
      payloadProtocol: d.payload_protocol,
      pt: d.pt,
      challenge,
    };
  }

  private async storeSession(captchaId: string, challenge: string): Promise<void> {
    const key = `auth:captcha:geetest:${captchaId}`;
    if (this.redis.enabled) {
      await this.redis.setJson(key, { challenge }, this.ttlSec());
      return;
    }
    memRegister.set(captchaId, { challenge, createdAt: Date.now() });
  }

  private async consumeSession(captchaId: string): Promise<void> {
    const key = `auth:captcha:geetest:${captchaId}`;
    if (this.redis.enabled) {
      const raw = await this.redis.getJson<{ challenge: string }>(key);
      await this.redis.del(key);
      if (!raw?.challenge) {
        throw new BadRequestException('Invalid or expired captcha');
      }
      return;
    }
    const rec = memRegister.get(captchaId);
    memRegister.delete(captchaId);
    if (!rec || Date.now() - rec.createdAt > this.ttlSec() * 1000) {
      throw new BadRequestException('Invalid or expired captcha');
    }
  }

  async verify(input: RegisterCaptchaVerifyInput): Promise<void> {
    const captchaId = input.captchaId?.trim();
    const lotNumber = input.lotNumber?.trim();
    const captchaOutput = input.captchaOutput?.trim();
    const passToken = input.passToken?.trim();
    const genTime = input.genTime?.trim();
    if (!captchaId || !lotNumber || !captchaOutput || !passToken || !genTime) {
      throw new BadRequestException(
        'captchaId, lotNumber, captchaOutput, passToken and genTime are required for Geetest',
      );
    }
    await this.consumeSession(captchaId);

    const signToken = createHmac('sha256', this.captchaKey()).update(lotNumber).digest('hex');
    const geetestCaptchaId = this.captchaIdConfig();
    const url = `${this.apiServer()}/validate`;
    const { data } = await axios.post<{
      status?: string;
      result?: string;
      reason?: string;
      msg?: string;
    }>(
      url,
      {
        lot_number: lotNumber,
        captcha_output: captchaOutput,
        pass_token: passToken,
        gen_time: genTime,
        sign_token: signToken,
      },
      {
        params: { captcha_id: geetestCaptchaId },
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    if (data.status !== 'success' || data.result !== 'success') {
      this.log.debug(`Geetest validate failed: ${data.reason ?? data.msg ?? 'unknown'}`);
      throw new BadRequestException('Invalid or expired captcha');
    }
  }
}
