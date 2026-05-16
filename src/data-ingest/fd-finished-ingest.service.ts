import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DataSourceType,
  MatchStatus,
  Prisma,
} from '@prisma/client';
import axios, { type AxiosInstance } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { FootballDataService } from '../football-data/football-data.service';
import { FOOTBALL_DATA_COMPETITION_CODES } from '../common/constants/competition.constant';

type FdMatch = {
  id?: number;
  utcDate?: string;
  status?: string;
  matchday?: number;
  homeTeam?: { id?: number; name?: string; shortName?: string; crest?: string };
  awayTeam?: { id?: number; name?: string; shortName?: string; crest?: string };
  score?: {
    fullTime?: { home?: number | null; away?: number | null };
    halfTime?: { home?: number | null; away?: number | null };
    extraTime?: { home?: number | null; away?: number | null };
    penalties?: { home?: number | null; away?: number | null };
  };
};

function mapFdStatus(raw: string | undefined): MatchStatus {
  switch ((raw || '').toUpperCase()) {
    case 'FINISHED':
      return MatchStatus.FINISHED;
    case 'LIVE':
    case 'IN_PLAY':
    case 'PAUSED':
      return MatchStatus.LIVE;
    case 'TIMED':
      return MatchStatus.SCHEDULED;
    case 'POSTPONED':
      return MatchStatus.POSTPONED;
    case 'CANCELLED':
    case 'SUSPENDED':
      return MatchStatus.CANCELLED;
    default:
      return MatchStatus.SCHEDULED;
  }
}

@Injectable()
export class FdFinishedIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly footballData: FootballDataService,
  ) {}

  private http(): AxiosInstance {
    const key = this.config.get<string>('footballDataApiKey');
    if (!key?.trim()) {
      throw new Error('FOOTBALL_DATA_API_KEY missing');
    }
    const baseURL =
      this.config.get<string>('footballDataBaseUrl') || 'https://api.football-data.org/v4';
    return axios.create({
      baseURL,
      timeout: 45000,
      headers: { 'X-Auth-Token': key.trim() },
    });
  }

  private async log(
    statusCode: number | null,
    success: boolean,
    message?: string,
  ) {
    await this.prisma.apiLog.create({
      data: {
        provider: 'football-data',
        endpoint: 'data-ingest/finished',
        method: 'GET',
        statusCode: statusCode ?? undefined,
        success,
        message,
      },
    });
  }

  /**
   * 拉取指定窗口内 **已完赛** 场次，写入/更新 Match + MatchFacts（忽略未开赛）。
   */
  async ingestFinishedRange(opts: {
    codes: string[];
    dateFrom: string;
    dateTo: string;
  }): Promise<Record<string, unknown>> {
    const codes = opts.codes.filter((c) =>
      FOOTBALL_DATA_COMPETITION_CODES.includes(
        c as (typeof FOOTBALL_DATA_COMPETITION_CODES)[number],
      ),
    );
    const http = this.http();
    const summary: Record<string, unknown> = {};
    for (const code of codes) {
      try {
        summary[code] = await this.ingestFinishedForCode(http, code, opts.dateFrom, opts.dateTo);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        summary[code] = { error: msg };
        await this.log(null, false, `${code}: ${msg}`);
      }
    }
    return summary;
  }

  private async ingestFinishedForCode(
    http: AxiosInstance,
    code: string,
    dateFrom: string,
    dateTo: string,
  ) {
    const compRow = await this.prisma.competition.findFirst({
      where: { code },
    });
    if (!compRow) {
      throw new NotFoundException(`本地缺少 competition code=${code}，请先 seed / 创建赛事实例`);
    }

    const { data, status } = await http.get(`/competitions/${code}/matches`, {
      params: {
        status: 'FINISHED',
        dateFrom,
        dateTo,
        limit: 500,
      },
    });
    await this.log(status, true);

    const fdCompetitionExternalId = String((data as { competition?: { id?: number } }).competition?.id ?? '');
    const matches = ((data as { matches?: FdMatch[] }).matches ?? []).filter(
      (m) => (m.status || '').toUpperCase() === 'FINISHED',
    );

    let upserted = 0;
    for (const m of matches) {
      if (m.id == null || !m.utcDate) continue;
      const home = await this.footballData.upsertTeamFromFdForIngest(m.homeTeam);
      const away = await this.footballData.upsertTeamFromFdForIngest(m.awayTeam);
      const utc = new Date(String(m.utcDate));
      const st = mapFdStatus(m.status);
      const ft = m.score?.fullTime;
      const ht = m.score?.halfTime;
      const et = m.score?.extraTime;
      const pen = m.score?.penalties;

      await this.prisma.match.upsert({
        where: { externalId: String(m.id) },
        create: {
          externalId: String(m.id),
          competitionId: compRow.id,
          tournamentId: compRow.tournamentId ?? undefined,
          seasonId: compRow.seasonId ?? undefined,
          round: m.matchday != null ? `Matchday ${m.matchday}` : undefined,
          matchday: m.matchday ?? undefined,
          homeTeamId: home.id,
          awayTeamId: away.id,
          kickoffTime: utc,
          status: st,
          homeScore: ft?.home ?? undefined,
          awayScore: ft?.away ?? undefined,
          dataSource: DataSourceType.FOOTBALL_DATA,
        },
        update: {
          competitionId: compRow.id,
          tournamentId: compRow.tournamentId ?? undefined,
          seasonId: compRow.seasonId ?? undefined,
          round: m.matchday != null ? `Matchday ${m.matchday}` : undefined,
          matchday: m.matchday ?? undefined,
          homeTeamId: home.id,
          awayTeamId: away.id,
          kickoffTime: utc,
          status: st,
          homeScore: ft?.home ?? undefined,
          awayScore: ft?.away ?? undefined,
          dataSource: DataSourceType.FOOTBALL_DATA,
        },
      });

      const row = await this.prisma.match.findUnique({
        where: { externalId: String(m.id) },
        select: { id: true },
      });
      if (!row) continue;

      const rawSnap = m as unknown as Prisma.InputJsonValue;

      await this.prisma.matchFacts.upsert({
        where: { matchId: row.id },
        create: {
          matchId: row.id,
          htHome: ht?.home ?? undefined,
          htAway: ht?.away ?? undefined,
          ftHome: ft?.home ?? undefined,
          ftAway: ft?.away ?? undefined,
          etHome: et?.home ?? undefined,
          etAway: et?.away ?? undefined,
          penHome: pen?.home ?? undefined,
          penAway: pen?.away ?? undefined,
          rawFdMatch: rawSnap,
          externalRefs: {
            FOOTBALL_DATA: String(m.id),
            ...(fdCompetitionExternalId ? { FD_COMPETITION: fdCompetitionExternalId } : {}),
          } as Prisma.InputJsonValue,
          primaryProvider: DataSourceType.FOOTBALL_DATA,
          providerTag: 'football-data.org',
          lastSyncedAt: new Date(),
          validatedAt: new Date(),
        },
        update: {
          htHome: ht?.home ?? undefined,
          htAway: ht?.away ?? undefined,
          ftHome: ft?.home ?? undefined,
          ftAway: ft?.away ?? undefined,
          etHome: et?.home ?? undefined,
          etAway: et?.away ?? undefined,
          penHome: pen?.home ?? undefined,
          penAway: pen?.away ?? undefined,
          rawFdMatch: rawSnap,
          externalRefs: {
            FOOTBALL_DATA: String(m.id),
            ...(fdCompetitionExternalId ? { FD_COMPETITION: fdCompetitionExternalId } : {}),
          } as Prisma.InputJsonValue,
          primaryProvider: DataSourceType.FOOTBALL_DATA,
          providerTag: 'football-data.org',
          lastSyncedAt: new Date(),
          validatedAt: new Date(),
        },
      });
      upserted += 1;
    }

    return {
      fetched: (data as { matches?: unknown[] }).matches?.length ?? 0,
      finishedFiltered: matches.length,
      upserted,
      dateFrom,
      dateTo,
    };
  }
}
