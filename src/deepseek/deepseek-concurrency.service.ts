import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type QueueWaiter = {
  resolve: () => void;
  reject: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * 限制单进程内同时向 DeepSeek 发起的 HTTP 请求数，防止万人峰时无限并发拖垮事件循环与上游。
 * 多实例部署时：每实例各有一套计数，总外呼并发 ≈ DEEPSEEK_MAX_CONCURRENT × 副本数。
 */
@Injectable()
export class DeepseekConcurrencyService {
  private active = 0;
  private readonly queue: QueueWaiter[] = [];

  constructor(private readonly config: ConfigService) {}

  private get max(): number {
    const n = this.config.get<number>('deepseekMaxConcurrent');
    return Number.isFinite(n) && (n as number) > 0 ? (n as number) : 80;
  }

  private get waitMs(): number {
    const n = this.config.get<number>('deepseekAcquireWaitMs');
    return Number.isFinite(n) && (n as number) > 0 ? (n as number) : 180_000;
  }

  /** 在槽位内执行 fn；槽满时排队，超时抛出 503 */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.queue.findIndex((w) => w.timer === timer);
        if (i >= 0) this.queue.splice(i, 1);
        reject(
          new ServiceUnavailableException(
            'AI 服务繁忙：当前并发已达上限，请稍后重试（可调 DEEPSEEK_MAX_CONCURRENT / 水平扩容）',
          ),
        );
      }, this.waitMs);
      this.queue.push({ resolve, reject, timer });
    }).then(() => {
      this.active++;
    });
  }

  private release(): void {
    if (this.active > 0) this.active--;
    const w = this.queue.shift();
    if (w) {
      clearTimeout(w.timer);
      w.resolve();
    }
  }
}
