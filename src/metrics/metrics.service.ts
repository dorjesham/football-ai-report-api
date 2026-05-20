import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly detailDuration: Histogram<'route'>;
  private readonly oddsLiveSyncTotal: Counter<'result'>;
  private readonly afSyncTotal: Counter<'endpoint' | 'result'>;
  private readonly predictionsPresentRatio: Gauge;
  private readonly afSyncSuccessRate: Gauge;

  constructor(private readonly prisma: PrismaService) {
    collectDefaultMetrics({ register: this.registry });

    this.detailDuration = new Histogram({
      name: 'detail_v2_request_duration_seconds',
      help: 'Match detail v2 handler latency',
      labelNames: ['route'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });

    this.oddsLiveSyncTotal = new Counter({
      name: 'odds_live_sync_total',
      help: 'B5 live odds snapshot captures',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.afSyncTotal = new Counter({
      name: 'af_sync_requests_total',
      help: 'API-Football sync attempts by endpoint',
      labelNames: ['endpoint', 'result'],
      registers: [this.registry],
    });

    this.predictionsPresentRatio = new Gauge({
      name: 'predictions_present_ratio',
      help: 'Share of AF bundles with non-null predictionsJson (7d window)',
      registers: [this.registry],
    });

    this.afSyncSuccessRate = new Gauge({
      name: 'af_sync_success_rate',
      help: 'AfSyncLog success ratio over last 24h',
      registers: [this.registry],
    });
  }

  observeDetailDuration(route: string, seconds: number) {
    this.detailDuration.labels(route).observe(seconds);
  }

  recordOddsLiveSync(ok: boolean) {
    this.oddsLiveSyncTotal.labels(ok ? 'ok' : 'fail').inc();
  }

  recordAfSync(endpoint: string, ok: boolean) {
    this.afSyncTotal.labels(endpoint, ok ? 'ok' : 'fail').inc();
  }

  async refreshDerivedGauges() {
    await this.refreshPredictionsPresentRatio();
    await this.refreshAfSyncSuccessRate();
  }

  async refreshAfSyncSuccessRate() {
    const since = new Date(Date.now() - 24 * 3600_000);
    const logs = await this.prisma.afSyncLog.findMany({
      where: { createdAt: { gte: since } },
      select: { status: true },
      take: 2000,
    });
    if (logs.length === 0) {
      this.afSyncSuccessRate.set(0);
      return;
    }
    const ok = logs.filter((l) => l.status === 'ok' || l.status === 'OK').length;
    this.afSyncSuccessRate.set(ok / logs.length);
  }

  async refreshPredictionsPresentRatio() {
    const since = new Date(Date.now() - 7 * 86400_000);
    const bundles = await this.prisma.matchAfRawBundle.findMany({
      where: { updatedAt: { gte: since } },
      select: { predictionsJson: true },
      take: 500,
    });
    if (bundles.length === 0) {
      this.predictionsPresentRatio.set(0);
      return;
    }
    const withPred = bundles.filter((b) => b.predictionsJson != null).length;
    this.predictionsPresentRatio.set(withPred / bundles.length);
  }
}
