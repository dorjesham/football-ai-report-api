import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { RedisService } from '../redis/redis.service';

type MemCounter = { count: number; dayKey: string };

const memIp = new Map<string, MemCounter>();
const memDevice = new Map<string, MemCounter>();

export type RegistrationLimitResult = {
  forceCaptcha: boolean;
  ipCount: number;
  requireCaptcha: boolean;
};

@Injectable()
export class AuthRegistrationLimitService {
  private readonly log = new Logger(AuthRegistrationLimitService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private dayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private ttlToMidnightSec(): number {
    const now = new Date();
    const end = new Date(now);
    end.setUTCHours(23, 59, 59, 999);
    return Math.max(60, Math.ceil((end.getTime() - now.getTime()) / 1000));
  }

  resolveClientIp(req: Request): string {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.trim()) {
      return xf.split(',')[0]!.trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  resolveDeviceId(req: Request): string | null {
    const h = req.headers['x-device-id'];
    if (typeof h === 'string' && h.trim().length >= 8 && h.trim().length <= 128) {
      return h.trim();
    }
    return null;
  }

  private async bump(store: Map<string, MemCounter>, mapKey: string, id: string): Promise<number> {
    const ttl = this.ttlToMidnightSec();
    if (this.redis.enabled) {
      const n = await this.redis.incrDaily(mapKey, ttl);
      if (n != null) return n;
    }
    const dk = this.dayKey();
    let rec = store.get(id);
    if (!rec || rec.dayKey !== dk) {
      rec = { count: 0, dayKey: dk };
    }
    rec.count += 1;
    store.set(id, rec);
    return rec.count;
  }

  async assertRegistrationAllowed(req: Request): Promise<RegistrationLimitResult> {
    const ip = this.resolveClientIp(req);
    const deviceId = this.resolveDeviceId(req);
    const maxIp = this.config.get<number>('authRegisterMaxPerIpDay') ?? 5;
    const maxDev = this.config.get<number>('authRegisterMaxPerDeviceDay') ?? 3;
    const skipUntil = this.config.get<number>('authCaptchaSkipUntil') ?? 0;

    const ipCount = await this.bump(memIp, `auth:reg:ip:${ip}`, ip);
    if (ipCount > maxIp) {
      throw new BadRequestException('Too many registrations from this network today');
    }

    let devCount = 0;
    if (deviceId) {
      devCount = await this.bump(memDevice, `auth:reg:device:${deviceId}`, deviceId);
      if (devCount > maxDev) {
        throw new BadRequestException('Too many registrations from this device today');
      }
    }

    const forceCaptcha = ipCount >= maxIp || (deviceId ? devCount >= maxDev : false);
    const requireCaptcha =
      forceCaptcha || skipUntil === 0 || ipCount > skipUntil;

    if (!this.redis.enabled && ipCount > 1) {
      this.log.warn('Registration limits use in-memory fallback (Redis disabled)');
    }

    return { forceCaptcha, ipCount, requireCaptcha };
  }
}
