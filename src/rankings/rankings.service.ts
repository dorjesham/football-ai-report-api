import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ApiFootballService } from '../api-football/api-football.service';
import { RedisService } from '../redis/redis.service';
import { leagueIdForCode } from '../api-football/api-football.constants';
import {
  competitionIdToCode,
  DEFAULT_LEADERBOARD_CODES,
  LEAGUE_CODE_TO_COMPETITION_ID,
} from '../leagues/league-code.constants';
import { mapPlayerMarketValueFields } from '../players/player-market.util';
import { normalizeTopscorersResponse } from './rankings-af-fallback.util';
import { extractPlayerSeasonStats } from './rankings-player-profile.util';
import { MatchPresentationEnricherService } from '../localization/match-presentation-enricher.service';

export type PlayerRankingMetric =
  | 'powerRating'
  | 'fantasyPrice'
  | 'fbrefMinutes'
  | 'goals'
  | 'assists';
export type RankingsSourceMode = 'db' | 'api_football' | 'auto';

@Injectable()
export class RankingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiFootball: ApiFootballService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly presentation: MatchPresentationEnricherService,
  ) {}

  private defaultSource(): RankingsSourceMode {
    const raw = this.config.get<string>('rankingsDefaultSource') ?? 'auto';
    if (raw === 'db' || raw === 'api_football' || raw === 'auto') return raw;
    return 'auto';
  }

  private afFallbackEnabled(): boolean {
    if (this.config.get<boolean>('enableRankingsAfFallback') === true) return true;
    return this.config.get<string>('nodeEnv') !== 'production';
  }

  async playerRanking(opts: {
    competitionId?: string;
    code?: string;
    season?: number;
    metric: PlayerRankingMetric;
    limit: number;
    source?: RankingsSourceMode;
  }) {
    const take = Math.min(Math.max(opts.limit, 1), 100);
    const source = opts.source ?? this.defaultSource();
    const code =
      opts.code?.trim().toUpperCase() ||
      (opts.competitionId ? competitionIdToCode(opts.competitionId) : null) ||
      undefined;
    const competitionId =
      opts.competitionId?.trim() ||
      (code ? LEAGUE_CODE_TO_COMPETITION_ID[code] : undefined);

    if (source === 'api_football') {
      if (!code) {
        throw new BadRequestException('code or competitionId required for api_football source');
      }
      return this.fromApiFootballCached(
        code,
        opts.season ?? 2025,
        opts.metric,
        take,
        competitionId ?? null,
      );
    }

    const seasonYear = opts.season ?? 2025;
    const dbPack = await this.fromDb({
      competitionId,
      metric: opts.metric,
      take,
      seasonYear,
    });

    if (source === 'db' || dbPack.items.length > 0) {
      return { ...dbPack, source: 'db' as const };
    }

    if (
      code?.trim() &&
      (opts.metric === 'goals' || opts.metric === 'assists') &&
      this.afFallbackEnabled()
    ) {
      return this.fromApiFootballCached(
        code.trim(),
        seasonYear,
        'goals',
        take,
        competitionId ?? null,
      );
    }

    if (
      code?.trim() &&
      this.afFallbackEnabled() &&
      this.config.get<string>('nodeEnv') !== 'production'
    ) {
      return this.fromApiFootballCached(
        code.trim(),
        opts.season ?? 2025,
        opts.metric,
        take,
        competitionId ?? null,
      );
    }

    return { ...dbPack, source: 'db' as const };
  }

  async leaderboardsBundle(opts: {
    codes?: string;
    season?: number;
    wcSeason?: number;
  }) {
    const season = opts.season ?? 2025;
    const wcSeason = opts.wcSeason ?? 2026;
    const codes =
      opts.codes?.trim() ?
        opts.codes
          .split(/[,\s]+/)
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean)
      : [...DEFAULT_LEADERBOARD_CODES];

    const leagues: Array<{
      code: string;
      season: number;
      competitionId: string | null;
      standings: { groups: Array<{ groupName: string; rows: unknown[] }> };
      topscorers: { metric: string; items: unknown[] };
    }> = [];

    for (const code of codes) {
      const seasonYear = code === 'WC' ? wcSeason : season;
      const competitionId = LEAGUE_CODE_TO_COMPETITION_ID[code] ?? null;
      const standingsGroups = competitionId
        ? await this.standingsGroupsFromDb(competitionId, seasonYear)
        : [];
      const topscorers = await this.fromDb({
        competitionId: competitionId ?? undefined,
        metric: 'goals',
        take: 30,
        seasonYear,
      });
      leagues.push({
        code,
        season: seasonYear,
        competitionId,
        standings: { groups: standingsGroups },
        topscorers: { metric: 'goals', items: topscorers.items },
      });
    }

    return { season, wcSeason, leagues };
  }

  private async standingsGroupsFromDb(competitionId: string, seasonYear: number) {
    const rows = await this.prisma.competitionStanding.findMany({
      where: { competitionId, seasonYear },
      include: { team: true },
      orderBy: [{ groupName: 'asc' }, { rank: 'asc' }],
    });
    const byGroup = new Map<string, typeof rows>();
    for (const r of rows) {
      const g = r.groupName || '';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(r);
    }
    return [...byGroup.entries()].map(([groupName, groupRows]) => ({
      groupName,
      rows: groupRows.map((r) => {
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
      }),
    }));
  }

  private async fromDb(opts: {
    competitionId?: string;
    metric: PlayerRankingMetric;
    take: number;
    seasonYear?: number;
  }) {
    if (
      (opts.metric === 'goals' || opts.metric === 'assists') &&
      opts.competitionId?.trim()
    ) {
      const metricRows = await this.fromDbSeasonMetric({
        competitionId: opts.competitionId.trim(),
        metric: opts.metric,
        take: opts.take,
        seasonYear: opts.seasonYear ?? 2025,
      });
      if (metricRows.items.length > 0) return metricRows;
    }

    let teamIds: string[] | undefined;
    if (opts.competitionId?.trim()) {
      const matches = await this.prisma.match.findMany({
        where: { competitionId: opts.competitionId.trim() },
        select: { homeTeamId: true, awayTeamId: true },
      });
      const s = new Set<string>();
      for (const m of matches) {
        s.add(m.homeTeamId);
        s.add(m.awayTeamId);
      }
      teamIds = [...s];
    }
    const orderBy =
      opts.metric === 'powerRating' ? { powerRating: 'desc' as const }
      : opts.metric === 'fantasyPrice' ? { fantasyPrice: 'desc' as const }
      : { fbrefMinutes: 'desc' as const };

    const rows = await this.prisma.player.findMany({
      where: {
        ...(teamIds?.length ? { teamId: { in: teamIds } } : {}),
        [opts.metric]: { not: null },
      },
      orderBy,
      take: opts.take,
      include: {
        team: { select: { id: true, nameCn: true, nameEn: true, logoUrl: true } },
      },
    });

    return {
      metric: opts.metric,
      competitionId: opts.competitionId ?? null,
      items: rows.map((p, i) => this.mapDbPlayer(p, i + 1, opts.metric)),
    };
  }

  private async fromDbSeasonMetric(opts: {
    competitionId: string;
    metric: 'goals' | 'assists';
    take: number;
    seasonYear: number;
  }) {
    const rows = await this.prisma.playerSeasonMetric.findMany({
      where: {
        competitionId: opts.competitionId,
        seasonYear: opts.seasonYear,
        metric: opts.metric,
      },
      orderBy: [{ rank: 'asc' }, { value: 'desc' }],
      take: opts.take,
      include: {
        player: {
          include: {
            team: {
              select: {
                id: true,
                nameCn: true,
                nameEn: true,
                logoUrl: true,
                externalId: true,
                apiFootballTeamId: true,
              },
            },
          },
        },
      },
    });

    return {
      metric: opts.metric,
      competitionId: opts.competitionId,
      items: rows.map((r, i) => {
        const extra =
          r.extra && typeof r.extra === 'object' && !Array.isArray(r.extra)
            ? (r.extra as {
                nameCn?: string;
                nameEn?: string;
                avatarUrl?: string;
                teamName?: string;
                teamLogo?: string;
                position?: string;
              })
            : {};
        const p = r.player;
        const rank = r.rank ?? i + 1;
        const metricValue = r.value;
        const pd = this.presentation.enrichPlayer({
          nameCn: extra.nameCn || p.nameCn,
          nameEn: extra.nameEn || p.nameEn,
          externalId: p.externalId,
        });
        const td = this.presentation.enrichTeam({
          nameCn: p.team.nameCn,
          nameEn: p.team.nameEn,
          externalId: p.team.externalId ?? null,
        });
        return {
          rank,
          playerId: p.id,
          id: p.id,
          nameCn: extra.nameCn || p.nameCn,
          nameEn: extra.nameEn || p.nameEn,
          displayName: pd.displayName,
          translationStatus: pd.translationStatus,
          position: extra.position ?? p.position,
          avatarUrl: extra.avatarUrl ?? p.avatarUrl,
          goals: r.goals ?? (opts.metric === 'goals' ? metricValue : null),
          assists: r.assists ?? (opts.metric === 'assists' ? metricValue : null),
          minutes: null,
          powerRating: p.powerRating,
          fantasyPrice: p.fantasyPrice,
          fbrefMinutes: p.fbrefMinutes,
          metricValue,
          player: {
            nameCn: extra.nameCn || p.nameCn,
            nameEn: extra.nameEn || p.nameEn,
            displayName: pd.displayName,
            avatarUrl: extra.avatarUrl ?? p.avatarUrl,
            position: extra.position ?? p.position,
            teamName: td.displayName,
            teamDisplayName: td.displayName,
            teamLogo: extra.teamLogo ?? p.team.logoUrl,
          },
          team: { ...p.team, displayName: td.displayName, translationStatus: td.translationStatus },
        };
      }),
    };
  }

  private mapDbPlayer(
    p: {
      id: string;
      nameCn: string;
      nameEn: string;
      position: string | null;
      shirtNumber: number | null;
      nationality: string | null;
      avatarUrl: string | null;
      powerRating: number | null;
      fantasyPrice: number | null;
      fbrefMinutes: number | null;
      profile: unknown;
      team: { id: string; nameCn: string; nameEn: string; logoUrl: string | null };
    },
    rank: number,
    metric: PlayerRankingMetric,
  ) {
    const stats = extractPlayerSeasonStats(p.profile as never);
    const metricValue =
      metric === 'powerRating' ? p.powerRating
      : metric === 'fantasyPrice' ? p.fantasyPrice
      : metric === 'fbrefMinutes' ? p.fbrefMinutes
      : null;
    const pd = this.presentation.enrichPlayer({
      nameCn: p.nameCn,
      nameEn: p.nameEn,
      externalId: null,
    });
    const td = this.presentation.enrichTeam({
      nameCn: p.team.nameCn,
      nameEn: p.team.nameEn,
      externalId: null,
    });
    return {
      rank,
      playerId: p.id,
      id: p.id,
      nameCn: p.nameCn,
      nameEn: p.nameEn,
      displayName: pd.displayName,
      translationStatus: pd.translationStatus,
      position: p.position,
      shirtNumber: p.shirtNumber,
      nationality: p.nationality,
      avatarUrl: p.avatarUrl,
      powerRating: p.powerRating,
      fantasyPrice: p.fantasyPrice,
      fbrefMinutes: p.fbrefMinutes,
      goals: stats.goals,
      assists: stats.assists,
      minutes: stats.minutes,
      age: stats.age,
      metricValue,
      ...mapPlayerMarketValueFields(p.profile as never),
      player: {
        nameCn: p.nameCn,
        nameEn: p.nameEn,
        displayName: pd.displayName,
        avatarUrl: p.avatarUrl,
        position: p.position,
        teamName: td.displayName,
        teamDisplayName: td.displayName,
        teamLogo: p.team.logoUrl,
      },
      team: { ...p.team, displayName: td.displayName, translationStatus: td.translationStatus },
    };
  }

  private async fromApiFootballCached(
    code: string,
    season: number,
    metric: PlayerRankingMetric,
    take: number,
    competitionId: string | null,
  ) {
    const cacheKey = `rankings:topscorers:${code}:${season}:${metric}`;
    const ttl = this.config.get<number>('cacheRankingsTopscorersTtlSec') ?? 21600;
    const cached = await this.redis.getJson<{
      metric: PlayerRankingMetric;
      competitionId: string | null;
      code: string;
      season: number;
      source: 'api_football';
      items: unknown[];
    }>(cacheKey);
    if (cached) return { ...cached, items: cached.items.slice(0, take) };
    const pack = await this.fromApiFootball(code, season, metric, take, competitionId);
    await this.redis.setJson(cacheKey, pack, ttl);
    return pack;
  }

  private async fromApiFootball(
    code: string,
    season: number,
    metric: PlayerRankingMetric,
    take: number,
    competitionId: string | null,
  ) {
    const leagueId = leagueIdForCode(code);
    if (leagueId == null) {
      throw new BadRequestException(`Unknown league code: ${code}`);
    }
    const pack = await this.apiFootball.getTopscorers(leagueId, season);
    const afMetric = metric === 'fbrefMinutes' ? 'goals' : metric === 'fantasyPrice' ? 'goals' : 'goals';
    const normalized = normalizeTopscorersResponse(pack.response, afMetric).slice(0, take);
    return {
      metric,
      competitionId,
      code,
      season,
      source: 'api_football' as const,
      items: normalized.map((r) => ({
        rank: r.rank,
        playerId: r.playerId,
        id: r.playerId,
        nameCn: r.nameCn,
        nameEn: r.nameEn,
        position: r.position,
        avatarUrl: r.avatarUrl,
        goals: r.goals,
        assists: r.assists,
        minutes: r.minutes,
        powerRating: null,
        fantasyPrice: metric === 'fantasyPrice' ? r.metricValue : null,
        fbrefMinutes: metric === 'fbrefMinutes' ? r.minutes : null,
        metricValue: r.metricValue,
        marketValue: null,
        marketValueCurrency: 'EUR' as const,
        player: {
          nameCn: r.nameCn,
          nameEn: r.nameEn,
          avatarUrl: r.avatarUrl,
          position: r.position,
          teamName: r.teamName,
          teamLogo: r.teamLogo,
        },
        team:
          r.teamName ?
            { id: null, nameCn: r.teamName, nameEn: r.teamName, logoUrl: r.teamLogo }
          : null,
      })),
    };
  }
}
