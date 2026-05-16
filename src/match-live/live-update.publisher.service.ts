import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';
import { RedisService } from '../redis/redis.service';

export type LiveUpdateMessage = {
  matchId: string;
  seq: number;
  at: string;
};

const LIVE_CHANNEL_PREFIX = 'live:update:';

@Injectable()
export class LiveUpdatePublisherService implements OnModuleDestroy {
  private readonly log = new Logger(LiveUpdatePublisherService.name);
  private subClient: Redis | null = null;
  private readonly localSubjects = new Map<string, Subject<LiveUpdateMessage>>();

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  channelForMatch(matchId: string): string {
    return `${this.redis.keyPrefix}${LIVE_CHANNEL_PREFIX}${matchId}`;
  }

  async publish(matchId: string, seq: number): Promise<void> {
    const msg: LiveUpdateMessage = {
      matchId,
      seq,
      at: new Date().toISOString(),
    };
    const local = this.localSubjects.get(matchId);
    if (local) {
      local.next(msg);
    }
    if (!this.redis.enabled) return;
    try {
      const client = await this.getPubClient();
      await client.publish(this.channelForMatch(matchId), JSON.stringify(msg));
    } catch (e) {
      this.log.warn(`publish live update: ${String(e)}`);
    }
  }

  observe(matchId: string): Observable<LiveUpdateMessage> {
    let sub = this.localSubjects.get(matchId);
    if (!sub) {
      sub = new Subject<LiveUpdateMessage>();
      this.localSubjects.set(matchId, sub);
      void this.subscribeRedis(matchId, sub);
    }
    return sub.asObservable();
  }

  private async getPubClient(): Promise<Redis> {
    if (!this.subClient) {
      const url = this.config.get<string>('redisUrl')?.trim();
      const host = this.config.get<string>('redisHost')?.trim();
      this.subClient =
        url ?
          new Redis(url, { maxRetriesPerRequest: 2 })
        : new Redis({
            host,
            port: this.config.get<number>('redisPort') ?? 6379,
            password: this.config.get<string>('redisPassword') || undefined,
            username: this.config.get<string>('redisUsername') || undefined,
            maxRetriesPerRequest: 2,
          });
    }
    return this.subClient;
  }

  private createSubClient(): Redis | null {
    const url = this.config.get<string>('redisUrl')?.trim();
    const host = this.config.get<string>('redisHost')?.trim();
    if (!url && !host) return null;
    return url ?
        new Redis(url, { maxRetriesPerRequest: 2 })
      : new Redis({
          host,
          port: this.config.get<number>('redisPort') ?? 6379,
          password: this.config.get<string>('redisPassword') || undefined,
          username: this.config.get<string>('redisUsername') || undefined,
          maxRetriesPerRequest: 2,
        });
  }

  private async subscribeRedis(matchId: string, subject: Subject<LiveUpdateMessage>) {
    if (!this.redis.enabled) return;
    try {
      const sub = this.createSubClient();
      if (!sub) return;
      const channel = this.channelForMatch(matchId);
      await sub.subscribe(channel);
      sub.on('message', (_ch, payload) => {
        try {
          const parsed = JSON.parse(payload) as LiveUpdateMessage;
          if (parsed.matchId === matchId) {
            subject.next(parsed);
          }
        } catch {
          /* ignore */
        }
      });
    } catch (e) {
      this.log.warn(`redis subscribe: ${String(e)}`);
    }
  }

  async onModuleDestroy() {
    for (const s of this.localSubjects.values()) {
      s.complete();
    }
    if (this.subClient) {
      try {
        await this.subClient.quit();
      } catch {
        /* ignore */
      }
    }
  }
}
