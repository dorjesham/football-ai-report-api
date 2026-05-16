import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DataSourceType,
  MatchStatus,
  Prisma,
} from '@prisma/client';
import axios from 'axios';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { PrismaService } from '../prisma/prisma.service';
import { OpenFootballLeagueFileSchema } from './schemas/openfootball.zod';
import {
  OPENFOOTBALL_LEAGUE_TIMEZONES,
  defaultOpenFootballRawUrl,
} from './openfootball-timezones';

dayjs.extend(utc);
dayjs.extend(timezone);

function slugPart(s: string): string {
  return s
    .toLowerCase()
    .replace(/ fc$| afc$| cf$| club$/gi, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function parseMatchday(round?: string): number | undefined {
  if (!round) return undefined;
  const m = /matchday\s+(\d+)/i.exec(round);
  return m ? Number(m[1]) : undefined;
}

@Injectable()
export class OpenFootballIngestService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 从 football.json 拉取一届联赛 JSON，仅写入 **已有全场比分** 的场次（未完赛跳过）。
   * @param leagueKey 如 en.1、de.1
   * @param competitionCode 本地 Competition.code（如 PL、BL1）
   */
  async importLeagueJson(opts: {
    leagueKey: string;
    competitionCode: string;
    seasonFolder?: string;
    url?: string;
  }) {
    const seasonFolder = opts.seasonFolder ?? '2024-25';
    const url =
      opts.url ?? defaultOpenFootballRawUrl(opts.leagueKey, seasonFolder);
    const tz =
      OPENFOOTBALL_LEAGUE_TIMEZONES[opts.leagueKey] ?? 'Europe/London';

    const comp = await this.prisma.competition.findFirst({
      where: { code: opts.competitionCode },
    });
    if (!comp) {
      throw new NotFoundException(
        `本地缺少 competition code=${opts.competitionCode}`,
      );
    }

    const { data } = await axios.get(url, { timeout: 60000, responseType: 'json' });
    const parsed = OpenFootballLeagueFileSchema.safeParse(data);
    if (!parsed.success) {
      return {
        ok: false,
        errors: parsed.error.flatten(),
        url,
      };
    }

    let imported = 0;
    let skippedNoScore = 0;

    for (const m of parsed.data.matches) {
      const ft = m.score?.ft;
      if (!ft || ft.length < 2) {
        skippedNoScore += 1;
        continue;
      }

      const t1 = await this.ensureOpenFootballTeam(m.team1, opts.leagueKey);
      const t2 = await this.ensureOpenFootballTeam(m.team2, opts.leagueKey);

      const timeStr = (m.time || '15:00').trim();
      const localKick = dayjs.tz(
        `${m.date} ${timeStr}`,
        'YYYY-MM-DD HH:mm',
        tz,
      );
      const kickoffUtc = localKick.utc().toDate();

      const extId = `of-${opts.leagueKey}-${m.date}-${slugPart(m.team1)}-${slugPart(m.team2)}`;

      const md = parseMatchday(m.round);

      const matchRow = await this.prisma.match.upsert({
        where: { externalId: extId },
        create: {
          externalId: extId,
          competitionId: comp.id,
          tournamentId: comp.tournamentId ?? undefined,
          seasonId: comp.seasonId ?? undefined,
          round: m.round,
          matchday: md,
          homeTeamId: t1.id,
          awayTeamId: t2.id,
          kickoffTime: kickoffUtc,
          status: MatchStatus.FINISHED,
          homeScore: ft[0],
          awayScore: ft[1],
          dataSource: DataSourceType.WORLDFOOTBALL,
        },
        update: {
          round: m.round,
          matchday: md,
          kickoffTime: kickoffUtc,
          status: MatchStatus.FINISHED,
          homeScore: ft[0],
          awayScore: ft[1],
          dataSource: DataSourceType.WORLDFOOTBALL,
        },
      });

      const ht = m.score?.ht;
      await this.prisma.matchFacts.upsert({
        where: { matchId: matchRow.id },
        create: {
          matchId: matchRow.id,
          htHome: ht?.[0],
          htAway: ht?.[1],
          ftHome: ft[0],
          ftAway: ft[1],
          rawOpenfootball: m as unknown as Prisma.InputJsonValue,
          externalRefs: { OPENFOOTBALL_SLUG: extId } as Prisma.InputJsonValue,
          primaryProvider: DataSourceType.WORLDFOOTBALL,
          providerTag: 'openfootball-football.json',
          lastSyncedAt: new Date(),
          validatedAt: new Date(),
          validationLog: { schema: 'OpenFootballLeagueFileSchema', ok: true } as Prisma.InputJsonValue,
        },
        update: {
          htHome: ht?.[0],
          htAway: ht?.[1],
          ftHome: ft[0],
          ftAway: ft[1],
          rawOpenfootball: m as unknown as Prisma.InputJsonValue,
          providerTag: 'openfootball-football.json',
          lastSyncedAt: new Date(),
          validatedAt: new Date(),
        },
      });
      imported += 1;
    }

    return {
      ok: true,
      url,
      imported,
      skippedNoScore,
      leagueName: parsed.data.name,
    };
  }

  private async ensureOpenFootballTeam(name: string, leagueKey: string) {
    const externalId = `of-${leagueKey}-${slugPart(name)}`;
    const short = name.replace(/\s+FC$|\s+AFC$/i, '').trim();
    return this.prisma.team.upsert({
      where: { externalId },
      create: {
        externalId,
        nameCn: short,
        nameEn: name,
        shortName: short.slice(0, 32),
        dataSource: DataSourceType.WORLDFOOTBALL,
      },
      update: {
        nameEn: name,
        shortName: short.slice(0, 32),
        dataSource: DataSourceType.WORLDFOOTBALL,
      },
    });
  }
}
