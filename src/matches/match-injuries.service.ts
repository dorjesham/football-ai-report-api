import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiFootballService } from '../api-football/api-football.service';
import { RedisService } from '../redis/redis.service';
import { leagueIdForCode } from '../api-football/api-football.constants';
import { LEAGUE_CODE_TO_COMPETITION_ID } from '../leagues/league-code.constants';
import { PrismaService } from '../prisma/prisma.service';
import type { MatchPhaseInjuryItem } from '../match-phase/match-phase.types';
import {
  normalizeInjuriesResponse,
  splitInjuriesBySide,
} from './af-injuries.mapper';

export type MatchInjuriesPayload = {
  matchId: string;
  source: 'api_football';
  homeInjuries: MatchPhaseInjuryItem[];
  awayInjuries: MatchPhaseInjuryItem[];
  items: MatchPhaseInjuryItem[];
};

@Injectable()
export class MatchInjuriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiFootball: ApiFootballService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async forMatch(matchId: string): Promise<MatchInjuriesPayload> {
    const cacheKey = `injuries:match:${matchId}`;
    const ttl = this.config.get<number>('cacheMatchInjuriesTtlSec') ?? 600;
    const cached = await this.redis.getJson<MatchInjuriesPayload>(cacheKey);
    if (cached) return cached;
    const data = await this.forMatchUncached(matchId);
    await this.redis.setJson(cacheKey, data, ttl);
    return data;
  }

  private async forMatchUncached(matchId: string): Promise<MatchInjuriesPayload> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { select: { id: true, externalId: true, nameCn: true } },
        awayTeam: { select: { id: true, externalId: true, nameCn: true } },
        competition: { select: { id: true, code: true } },
        matchFacts: { select: { injuriesJson: true } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const stored = match.matchFacts?.injuriesJson;
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      const j = stored as {
        homeInjuries?: MatchPhaseInjuryItem[];
        awayInjuries?: MatchPhaseInjuryItem[];
        items?: MatchPhaseInjuryItem[];
      };
      const homeInjuries = j.homeInjuries ?? [];
      const awayInjuries = j.awayInjuries ?? [];
      return {
        matchId,
        source: 'api_football' as const,
        homeInjuries,
        awayInjuries,
        items: j.items ?? [...homeInjuries, ...awayInjuries],
      };
    }

    if (this.config.get<string>('nodeEnv') === 'production') {
      return {
        matchId,
        source: 'api_football' as const,
        homeInjuries: [],
        awayInjuries: [],
        items: [],
      };
    }

    const fixtureId = this.parseAfFixtureId(match.externalId);
    let response: unknown[] = [];
    if (fixtureId != null) {
      const pack = await this.apiFootball.getInjuries({ fixture: fixtureId });
      response = pack.response;
    }

    const homeApi = this.parseAfTeamId(match.homeTeam.externalId);
    const awayApi = this.parseAfTeamId(match.awayTeam.externalId);
    const normalized = normalizeInjuriesResponse(response);
    const { homeInjuries, awayInjuries } = splitInjuriesBySide(
      normalized,
      homeApi,
      awayApi,
    );

    return {
      matchId,
      source: 'api_football' as const,
      homeInjuries,
      awayInjuries,
      items: [...homeInjuries, ...awayInjuries],
    };
  }

  async forLeagueTeam(opts: {
    code: string;
    season: number;
    teamId?: string;
    apiTeamId?: number;
  }) {
    const leagueId = leagueIdForCode(opts.code);
    if (leagueId == null) {
      throw new NotFoundException(`Unknown league code: ${opts.code}`);
    }
    let apiTeam = opts.apiTeamId;
    if (opts.teamId && apiTeam == null) {
      const t = await this.prisma.team.findUnique({
        where: { id: opts.teamId },
        select: { externalId: true },
      });
      apiTeam = this.parseAfTeamId(t?.externalId ?? null) ?? undefined;
    }
    const params: { league: number; season: number; team?: number } = {
      league: leagueId,
      season: opts.season,
    };
    if (apiTeam != null) params.team = apiTeam;
    const pack = await this.apiFootball.getInjuries(params);
    const upper = opts.code.toUpperCase();
    return {
      code: upper,
      competitionId: LEAGUE_CODE_TO_COMPETITION_ID[upper] ?? null,
      season: opts.season,
      source: 'api_football' as const,
      items: normalizeInjuriesResponse(pack.response),
    };
  }

  private parseAfFixtureId(externalId: string | null): number | null {
    if (!externalId?.startsWith('af-f-')) return null;
    const n = Number(externalId.slice('af-f-'.length));
    return Number.isFinite(n) ? n : null;
  }

  private parseAfTeamId(externalId: string | null): number | null {
    if (!externalId?.startsWith('af-t-')) return null;
    const n = Number(externalId.slice('af-t-'.length));
    return Number.isFinite(n) ? n : null;
  }
}
