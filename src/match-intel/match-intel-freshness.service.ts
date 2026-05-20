import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReportStatus } from '@prisma/client';
import { bundleFieldsForIntelHash } from '../api-football/ingest-endpoint.registry';
import { sha256StableJson } from '../common/utils/stable-content-hash.util';
import { PrismaService } from '../prisma/prisma.service';
import { LocalizationService } from '../localization/localization.service';

@Injectable()
export class MatchIntelFreshnessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly l10n: LocalizationService,
  ) {}

  async computeIntelContentHash(matchId: string): Promise<string> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        afRawBundle: true,
        teamSnapshots: true,
        weatherSnapshot: true,
        activePrediction: { select: { inputsHash: true } },
        refereeSnapshot: {
          select: {
            referee: { select: { externalId: true, nameCn: true, nameEn: true } },
          },
        },
        matchFacts: { select: { injuriesJson: true } },
      },
    });
    if (!match) return sha256StableJson({ missing: matchId });

    const bundleHashes =
      match.afRawBundle?.endpointHashes &&
      typeof match.afRawBundle.endpointHashes === 'object' ?
        (match.afRawBundle.endpointHashes as Record<string, string>)
      : this.hashBundleFallback(match.afRawBundle);

    const home = match.teamSnapshots.find((s) => s.isHome);
    const away = match.teamSnapshots.find((s) => !s.isHome);

    const payload: Record<string, unknown> = {
      bundle: bundleHashes,
      homeSnapshot: home?.contentHash ?? this.snapshotFieldsHash(home),
      awaySnapshot: away?.contentHash ?? this.snapshotFieldsHash(away),
      weather: match.weatherSnapshot?.contentHash ?? this.weatherFieldsHash(match.weatherSnapshot),
      activePredictionInputsHash: match.activePrediction?.inputsHash ?? null,
    };
    if (this.config.get<boolean>('enableAfFactsDualWrite') === true) {
      const ref = match.refereeSnapshot?.referee;
      payload.referee =
        ref ?
          sha256StableJson({
            externalId: ref.externalId,
            nameCn: ref.nameCn,
            nameEn: ref.nameEn,
          })
        : null;
      payload.factsInjuries =
        match.matchFacts?.injuriesJson != null ?
          sha256StableJson(match.matchFacts.injuriesJson)
        : null;
    }
    payload.translationHash = await this.l10n.computeTranslationHash();
    return sha256StableJson(payload);
  }

  async refreshIntelContentHash(matchId: string): Promise<string> {
    const hash = await this.computeIntelContentHash(matchId);
    const prev = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { intelContentHash: true },
    });

    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        intelContentHash: hash,
        intelContentHashAt: new Date(),
      },
    });

    if (prev?.intelContentHash && prev.intelContentHash !== hash) {
      await this.markStaleAiReports(matchId, hash);
    }

    return hash;
  }

  async markStaleAiReports(matchId: string, currentHash?: string): Promise<void> {
    const intelHash =
      currentHash ?? (await this.prisma.match.findUnique({
        where: { id: matchId },
        select: { intelContentHash: true },
      }))?.intelContentHash;

    if (!intelHash) return;

    await this.prisma.aiReport.updateMany({
      where: {
        matchId,
        status: ReportStatus.PUBLISHED,
        sourceIntelHash: { not: intelHash },
      },
      data: {
        isStale: true,
        staleReason: '底层比赛数据已更新',
        staleDetectedAt: new Date(),
      },
    });
  }

  private hashBundleFallback(
    bundle: Record<string, unknown> | null,
  ): Record<string, string> {
    if (!bundle) return {};
    const out: Record<string, string> = {};
    for (const field of bundleFieldsForIntelHash()) {
      const v = bundle[field];
      if (v != null) out[field] = sha256StableJson(v);
    }
    for (const extra of ['homeCoachJson', 'awayCoachJson', 'playersJson', 'eventsJson'] as const) {
      const v = bundle[extra];
      if (v != null) out[extra] = sha256StableJson(v);
    }
    return out;
  }

  private snapshotFieldsHash(
    snap: {
      leagueRank: number | null;
      recentForm: string | null;
      attackRating: number | null;
      defenseRating: number | null;
      goalsForAvg: number | null;
      goalsAgainstAvg: number | null;
    } | null | undefined,
  ): string | null {
    if (!snap) return null;
    return sha256StableJson({
      leagueRank: snap.leagueRank,
      recentForm: snap.recentForm,
      attackRating: snap.attackRating,
      defenseRating: snap.defenseRating,
      goalsForAvg: snap.goalsForAvg,
      goalsAgainstAvg: snap.goalsAgainstAvg,
    });
  }

  private weatherFieldsHash(
    w: {
      temperature: number | null;
      condition: string | null;
      humidity: number | null;
      windSpeed: number | null;
    } | null,
  ): string | null {
    if (!w) return null;
    return sha256StableJson({
      temperature: w.temperature,
      condition: w.condition,
      humidity: w.humidity,
      windSpeed: w.windSpeed,
    });
  }
}
