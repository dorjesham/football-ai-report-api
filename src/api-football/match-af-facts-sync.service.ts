import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataQuality,
  DataSourceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { shrinkJsonForWcProfile } from '../common/utils/wc2026-af-heritage-zh.util';
import {
  asRecord,
  extractAfFixtureMatchFields,
  extractAfScoreExtended,
  parseAfFixtureIdFromExternalId,
} from './af-fixture-match-fields.util';
import { ApiFootballService } from './api-football.service';
import { needsAfFactsSync } from './match-af-facts-sync.util';

export type MatchAfFactsSyncResult = {
  fixtureId: number;
  detail: Record<string, unknown>;
};

/**
 * 将 API-Football 单场 fixture（含 lineups / events / statistics）写入 MatchFacts，
 * 并同步 Match 核心字段与裁判快照；适用于任意 `externalId=af-f-*` 的场次（不仅世界杯）。
 */
@Injectable()
export class MatchAfFactsSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly api: ApiFootballService,
  ) {}

  async syncByMatchId(
    matchId: string,
    opts?: { delayMs?: number; providerTag?: string; force?: boolean },
  ): Promise<MatchAfFactsSyncResult> {
    const delay = Math.min(10_000, Math.max(0, opts?.delayMs ?? 350));
    const providerTag = opts?.providerTag ?? 'api-football-match-facts-v1';

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, externalId: true, status: true },
    });
    if (!match) throw new NotFoundException('Match not found');

    const fid = parseAfFixtureIdFromExternalId(match.externalId);
    if (fid == null) {
      throw new BadRequestException(
        '本场非 API-Football 主链：Match.externalId 须为 af-f-{fixtureId}，请使用 Football-Data intel 或先迁移 externalId',
      );
    }

    const existingFacts = await this.prisma.matchFacts.findUnique({
      where: { matchId },
      select: {
        lineups: true,
        events: true,
        teamStats: true,
        afLastSyncedAt: true,
        externalRefs: true,
      },
    });

    const skipCheck = needsAfFactsSync(match, existingFacts, { force: opts?.force });
    if (!skipCheck.needed) {
      return {
        fixtureId: fid,
        detail: { skipped: true, reason: skipCheck.reason, fixtureId: fid },
      };
    }

    const { item, raw } = await this.api.getFixtureById(fid);
    if (item == null) {
      throw new BadRequestException(`API-Football 未返回 fixture id=${fid}`);
    }

    if (delay > 0) await this.api.sleep(delay);
    const line = await this.api.getFixtureLineups(fid);

    if (delay > 0) await this.api.sleep(delay);
    const ev = await this.api.getFixtureEvents(fid);

    if (delay > 0) await this.api.sleep(delay);
    const stats = await this.api.getFixtureStatistics(fid);

    const itemRec = asRecord(item);
    const fx = asRecord(itemRec?.fixture);
    const venue = asRecord(fx?.venue);
    const refereeStr =
      typeof fx?.referee === 'string' && fx.referee.trim() ? fx.referee.trim() : null;

    const venueDetail = {
      id: venue?.id,
      name: venue?.name,
      city: venue?.city,
      address: venue?.address,
      capacity: venue?.capacity,
      surface: venue?.surface,
      image: venue?.image,
    };

    const officials =
      refereeStr ? [{ role: 'Referee', name: refereeStr, source: 'API_FOOTBALL' }] : [];

    const fields = extractAfFixtureMatchFields(item);
    const stadiumFromVenue =
      typeof venue?.name === 'string' && venue.name.trim() ?
        venue.name.trim()
      : undefined;

    if (fields) {
      const hs =
        fields.homeScore != null ? Math.trunc(fields.homeScore) : null;
      const as =
        fields.awayScore != null ? Math.trunc(fields.awayScore) : null;
      await this.prisma.match.update({
        where: { id: matchId },
        data: {
          kickoffTime: fields.kickoffTime,
          status: fields.status,
          homeScore: hs,
          awayScore: as,
          stadium: stadiumFromVenue ?? fields.stadium ?? undefined,
          dataSource: DataSourceType.API_FOOTBALL,
        },
      });
    } else {
      await this.prisma.match.update({
        where: { id: matchId },
        data: {
          stadium: stadiumFromVenue ?? undefined,
          dataSource: DataSourceType.API_FOOTBALL,
        },
      });
    }

    const extScores = extractAfScoreExtended(item);

    const prevRefs =
      existingFacts?.externalRefs &&
      typeof existingFacts.externalRefs === 'object' &&
      !Array.isArray(existingFacts.externalRefs) ?
        { ...(existingFacts.externalRefs as Record<string, unknown>) }
      : {};
    prevRefs.API_FOOTBALL = String(fid);
    prevRefs.apiFootballFixtureId = fid;

    const now = new Date();
    const rawAf = shrinkJsonForWcProfile(item, 22_000);

    await this.prisma.matchFacts.upsert({
      where: { matchId },
      create: {
        matchId,
        lineups: line.response as Prisma.InputJsonValue,
        events: ev.response as Prisma.InputJsonValue,
        teamStats: stats.response as Prisma.InputJsonValue,
        officials: officials as unknown as Prisma.InputJsonValue,
        venueDetail: venueDetail as Prisma.InputJsonValue,
        rawAfFixture: rawAf,
        primaryProvider: DataSourceType.API_FOOTBALL,
        providerTag,
        externalRefs: prevRefs as Prisma.InputJsonValue,
        lastSyncedAt: now,
        afLastSyncedAt: now,
        htHome: extScores.htHome ?? undefined,
        htAway: extScores.htAway ?? undefined,
        ftHome: extScores.ftHome ?? undefined,
        ftAway: extScores.ftAway ?? undefined,
        etHome: extScores.etHome ?? undefined,
        etAway: extScores.etAway ?? undefined,
        penHome: extScores.penHome ?? undefined,
        penAway: extScores.penAway ?? undefined,
      },
      update: {
        lineups: line.response as Prisma.InputJsonValue,
        events: ev.response as Prisma.InputJsonValue,
        teamStats: stats.response as Prisma.InputJsonValue,
        officials: officials as unknown as Prisma.InputJsonValue,
        venueDetail: venueDetail as Prisma.InputJsonValue,
        rawAfFixture: rawAf,
        primaryProvider: DataSourceType.API_FOOTBALL,
        providerTag,
        externalRefs: prevRefs as Prisma.InputJsonValue,
        lastSyncedAt: now,
        afLastSyncedAt: now,
        htHome: extScores.htHome ?? undefined,
        htAway: extScores.htAway ?? undefined,
        ftHome: extScores.ftHome ?? undefined,
        ftAway: extScores.ftAway ?? undefined,
        etHome: extScores.etHome ?? undefined,
        etAway: extScores.etAway ?? undefined,
        penHome: extScores.penHome ?? undefined,
        penAway: extScores.penAway ?? undefined,
      },
    });

    for (const side of line.response) {
      const sRec = asRecord(side);
      const teamNode = asRecord(sRec?.team);
      const tid = Number(teamNode?.id);
      const coach = sRec?.coach;
      if (!Number.isFinite(tid) || coach == null) continue;
      const dbTeam = await this.prisma.team.findUnique({
        where: { externalId: `af-t-${tid}` },
      });
      if (!dbTeam) continue;
      const prev = asRecord(dbTeam.coachProfile as Record<string, unknown> | null);
      const nextCoach = {
        ...(prev ?? {}),
        apiFootball: {
          ...(asRecord(prev?.apiFootball) ?? {}),
          lineupCoach: coach,
          ingestedAt: new Date().toISOString(),
          fixtureId: fid,
        },
      };
      const venueStr =
        typeof venue?.name === 'string' && venue.name.trim() ?
          venue.name.trim()
        : dbTeam.venue ?? undefined;
      await this.prisma.team.update({
        where: { id: dbTeam.id },
        data: {
          coachProfile: nextCoach as Prisma.InputJsonValue,
          venue: venueStr,
          country:
            typeof venue?.city === 'string' ?
              String(venue.city).split(',')[0]?.trim()
            : undefined,
        },
      });
    }

    if (refereeStr) {
      const ref = await this.prisma.referee.upsert({
        where: { externalId: `af-ref-${fid}` },
        create: {
          externalId: `af-ref-${fid}`,
          nameCn: refereeStr,
          nameEn: refereeStr,
          dataSource: DataSourceType.API_FOOTBALL,
        },
        update: { nameCn: refereeStr, nameEn: refereeStr },
      });
      await this.prisma.refereeSnapshot.upsert({
        where: { matchId },
        create: {
          matchId,
          refereeId: ref.id,
          notes: `主裁判字段来自 API-Football fixture ${fid}（姓名级公开数据）。`,
          dataQuality: DataQuality.PUBLIC_DATA,
          dataSource: DataSourceType.API_FOOTBALL,
        },
        update: {
          refereeId: ref.id,
          notes: `主裁判字段来自 API-Football fixture ${fid}。`,
          dataSource: DataSourceType.API_FOOTBALL,
        },
      });
    }

    const detail = {
      fixtureId: fid,
      lineupsSides: line.response.length,
      eventsCount: ev.response.length,
      statisticsRows: stats.response.length,
      hasRawFixture: item != null,
      providerTag,
      upstreamErrors: {
        lineups: summarizeErrors(line.raw),
        events: summarizeErrors(ev.raw),
        statistics: summarizeErrors(stats.raw),
        fixture: summarizeErrors(raw as Record<string, unknown>),
      },
    };

    return { fixtureId: fid, detail };
  }
}

function summarizeErrors(body: Record<string, unknown>): string | null {
  const err = body?.errors;
  if (err == null) return null;
  try {
    return typeof err === 'string' ? err : JSON.stringify(err).slice(0, 400);
  } catch {
    return String(err).slice(0, 400);
  }
}
