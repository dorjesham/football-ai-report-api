import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }

  get keyPrefix(): string {
    return (this.config.get<string>('redisKeyPrefix') || 'football:').replace(/\s/g, '');
  }

  async onModuleInit() {
    const url = this.config.get<string>('redisUrl')?.trim();
    const host = this.config.get<string>('redisHost')?.trim();
    if (!url && !host) {
      this.log.warn('Redis 未配置（无 REDIS_URL / REDIS_HOST），读缓存与 CDN 头仍可用，缓存退化为未命中');
      return;
    }
    try {
      this.client = url ?
        new Redis(url, {
          maxRetriesPerRequest: 2,
          enableReadyCheck: true,
          lazyConnect: false,
        })
      : new Redis({
          host,
          port: this.config.get<number>('redisPort') ?? 6379,
          password: this.config.get<string>('redisPassword') || undefined,
          username: this.config.get<string>('redisUsername') || undefined,
          maxRetriesPerRequest: 2,
          enableReadyCheck: true,
        });
      await this.client.ping();
      this.log.log(`Redis 已连接（前缀 ${this.keyPrefix}）`);
    } catch (e) {
      this.log.error(`Redis 连接失败，将禁用缓存: ${String(e)}`);
      if (this.client) {
        try {
          await this.client.quit();
        } catch {
          /* ignore */
        }
      }
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        /* ignore */
      }
      this.client = null;
    }
  }

  private k(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.enabled) return null;
    try {
      const raw = await this.client!.get(this.k(key));
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (e) {
      this.log.warn(`redis get ${key}: ${String(e)}`);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSec: number): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.client!.set(this.k(key), JSON.stringify(value), 'EX', Math.max(1, ttlSec));
    } catch (e) {
      this.log.warn(`redis set ${key}: ${String(e)}`);
    }
  }

  async setString(key: string, value: string, ttlSec: number): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.client!.set(this.k(key), value, 'EX', Math.max(1, ttlSec));
    } catch (e) {
      this.log.warn(`redis setString ${key}: ${String(e)}`);
    }
  }

  async getString(key: string): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      return await this.client!.get(this.k(key));
    } catch (e) {
      this.log.warn(`redis getString ${key}: ${String(e)}`);
      return null;
    }
  }

  /** 递增并设置 TTL（仅在新键时）；返回递增后的值 */
  async incrDaily(key: string, ttlSec: number): Promise<number | null> {
    if (!this.enabled) return null;
    try {
      const full = this.k(key);
      const n = await this.client!.incr(full);
      if (n === 1) {
        await this.client!.expire(full, Math.max(1, ttlSec));
      }
      return n;
    } catch (e) {
      this.log.warn(`redis incrDaily ${key}: ${String(e)}`);
      return null;
    }
  }

  async del(...logicalKeys: string[]): Promise<void> {
    if (!this.enabled || !logicalKeys.length) return;
    try {
      await this.client!.del(...logicalKeys.map((x) => this.k(x)));
    } catch (e) {
      this.log.warn(`redis del: ${String(e)}`);
    }
  }

  /** SCAN 删除匹配键（慎用大库；仅用于比赛维度失效） */
  async delPattern(patternLogical: string): Promise<number> {
    if (!this.enabled) return 0;
    const match = this.k(patternLogical);
    let cursor = '0';
    let deleted = 0;
    try {
      do {
        const [next, keys] = await this.client!.scan(cursor, 'MATCH', match, 'COUNT', 200);
        cursor = next;
        if (keys.length) {
          deleted += await this.client!.del(...keys);
        }
      } while (cursor !== '0');
    } catch (e) {
      this.log.warn(`redis delPattern ${patternLogical}: ${String(e)}`);
    }
    return deleted;
  }
}
