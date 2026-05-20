import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { leagueIdForCode } from '../api-football/api-football.constants';
import { ApiFootballService } from '../api-football/api-football.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompetitionsService } from '../competitions/competitions.service';
import { normalizeApiFootballStandingsResponse } from './af-standings.mapper';
import {
  DEFAULT_STANDINGS_CODES,
  LEAGUE_CODE_TO_COMPETITION_ID,
} from './league-code.constants';
import { MatchPresentationEnricherService } from '../localization/match-presentation-enricher.service';

export type StandingsSourceMode = 'api_football' | 'db' | 'auto';

export type LeagueStandingsPayload = {
  code: string;
  competitionId: string | null;
  season: number;
  source: 'api_football' | 'db';
  rows: Array<{
    rank: number;
    teamId: number | string | null;
    teamName: string;
    teamDisplayName?: string;
    teamLogo: string | null;
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
  }>;
};

@Injectable()
export class LeaguesStandingsService {
  constructor(
    private readonly apiFootball: ApiFootballService,
    private readonly competitions: CompetitionsService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly presentation: MatchPresentationEnricherService,
  ) {}

  private async enrichStandingsRows<
    T extends { teamId: number | string | null; teamName: string },
  >(rows: T[]): Promise<T[]> {
    const ids = rows
      .map((r) => (typeof r.teamId === 'string' ? r.teamId : null))
      .filter((id): id is string => !!id);
    const map = await this.presentation.teamDisplayNamesByIds(ids);
    return rows.map((r) => {
      const id = typeof r.teamId === 'string' ? r.teamId : null;
      const dn = id ? map.get(id)?.displayName : null;
      return {
        ...r,
        teamDisplayName: dn ?? r.teamName,
        teamName: dn ?? r.teamName,
      };
    });
  }

  private competitionIdForCode(code: string): string | null {
    return LEAGUE_CODE_TO_COMPETITION_ID[code.toUpperCase()] ?? null;
  }

  private parseCodes(codes?: string): string[] {
    const raw =
      codes?.trim() ?
        codes.split(/[,\s]+/).map((c) => c.trim().toUpperCase()).filter(Boolean)
      : [...DEFAULT_STANDINGS_CODES];
    if (!raw.length) {
      throw new BadRequestException('codes must not be empty');
    }
    return raw;
  }

  async standingsForCode(
    code: string,
    season: number,
    source: StandingsSourceMode = 'auto',
  ): Promise<LeagueStandingsPayload> {
    const upper = code.toUpperCase();
    const competitionId = this.competitionIdForCode(upper);
    const resolved = await this.resolveStandings(upper, competitionId, season, source);
    return { code: upper, competitionId, season, ...resolved };
  }

  async standingsBatch(
    codesParam: string | undefined,
    season: number,
    source: StandingsSourceMode = 'auto',
  ) {
    const codes = this.parseCodes(codesParam);
    const leagues: LeagueStandingsPayload[] = [];
    for (const code of codes) {
      leagues.push(await this.standingsForCode(code, season, source));
    }
    return { season, leagues };
  }

  private async resolveStandings(
    code: string,
    competitionId: string | null,
    season: number,
    source: StandingsSourceMode,
  ): Promise<Pick<LeagueStandingsPayload, 'source' | 'rows'>> {
    if (source === 'api_football') {
      return this.fromApiFootballCached(code, season);
    }
    if (source === 'db') {
      if (!competitionId) {
        return { source: 'db', rows: [] };
      }
      return this.fromDb(competitionId, season);
    }
    if (competitionId) {
      const db = await this.fromDb(competitionId, season);
      if (db.rows.length >= 5) return db;
    }
    if (this.config.get<string>('nodeEnv') === 'production') {
      return { source: 'db', rows: [] };
    }
    return this.fromApiFootballCached(code, season);
  }

  private async fromApiFootballCached(
    code: string,
    season: number,
  ): Promise<Pick<LeagueStandingsPayload, 'source' | 'rows'>> {
    const cacheKey = `leagues:standings:${code}:${season}`;
    const ttl = this.config.get<number>('cacheLeaguesStandingsTtlSec') ?? 1800;
    const cached = await this.redis.getJson<Pick<LeagueStandingsPayload, 'source' | 'rows'>>(
      cacheKey,
    );
    if (cached?.rows?.length) {
      return { source: cached.source, rows: await this.enrichStandingsRows(cached.rows) };
    }
    const fresh = await this.fromApiFootball(code, season);
    await this.redis.setJson(cacheKey, fresh, ttl);
    return fresh;
  }

  private async fromDb(
    competitionId: string,
    season?: number,
  ): Promise<Pick<LeagueStandingsPayload, 'source' | 'rows'>> {
    const seasonYear = season ?? 2025;
    let materialized: Awaited<
      ReturnType<
        typeof this.prisma.competitionStanding.findMany<{
          include: { team: true };
        }>
      >
    > = [];
    try {
      materialized = await this.prisma.competitionStanding.findMany({
        where: { competitionId, seasonYear },
        include: { team: true },
        orderBy: { rank: 'asc' },
      });
    } catch {
      materialized = [];
    }
    if (materialized.length >= 5) {
      const rows = materialized.map((r) => {
          const extra =
            r.extra && typeof r.extra === 'object' && !Array.isArray(r.extra)
              ? (r.extra as { teamName?: string; teamLogo?: string })
              : {};
          return {
            rank: r.rank,
            teamId: r.teamId,
            teamName:
              extra.teamName || r.team.nameCn || r.team.nameEn || r.teamId,
            teamLogo: extra.teamLogo ?? r.team.logoUrl ?? null,
            played: r.played ?? 0,
            wins: r.won ?? 0,
            draws: r.draw ?? 0,
            losses: r.lost ?? 0,
            goalsFor: r.goalsFor ?? 0,
            goalsAgainst: r.goalsAgainst ?? 0,
            goalDifference: r.goalDiff ?? 0,
            points: r.points ?? 0,
          };
      });
      return { source: 'db', rows: await this.enrichStandingsRows(rows) };
    }
    const pack = await this.competitions.computeStandings(competitionId);
    const rows = pack.rows.map((r, i) => ({
      rank: i + 1,
      teamId: r.teamId,
      teamName: r.team.nameCn || r.team.nameEn || r.teamId,
      teamLogo: r.team.logoUrl ?? null,
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDifference: r.goalDifference,
      points: r.points,
    }));
    return { source: 'db', rows: await this.enrichStandingsRows(rows) };
  }

  private async fromApiFootball(
    code: string,
    season: number,
  ): Promise<Pick<LeagueStandingsPayload, 'source' | 'rows'>> {
    const leagueId = leagueIdForCode(code);
    if (leagueId == null) {
      throw new BadRequestException(`Unknown league code: ${code}`);
    }
    const pack = await this.apiFootball.getStandings(leagueId, season);
    const rows = normalizeApiFootballStandingsResponse(pack.response).map((r) => ({
      rank: r.rank,
      teamId: r.teamId,
      teamName: r.teamName,
      teamLogo: r.teamLogo,
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDifference: r.goalDifference,
      points: r.points,
    }));
    return { source: 'api_football', rows: await this.enrichStandingsRows(rows) };
  }
}
