import { BadRequestException, Injectable } from '@nestjs/common';
import { leagueIdForCode } from '../api-football/api-football.constants';
import { ApiFootballService } from '../api-football/api-football.service';
import type {
  FootballFeedFixtureIdQueryDto,
  FootballFeedFixturesQueryDto,
  FootballFeedH2hQueryDto,
  FootballFeedInjuriesQueryDto,
  FootballFeedLeagueSeasonDto,
  FootballFeedOddsQueryDto,
  FootballFeedPlayerProfileQueryDto,
  FootballFeedPlayerSeasonsQueryDto,
  FootballFeedPlayerSquadsQueryDto,
  FootballFeedPlayersQueryDto,
  FootballFeedPredictionsQueryDto,
  FootballFeedStandingsQueryDto,
  FootballFeedTeamStatisticsQueryDto,
  FootballFeedTopscorersQueryDto,
} from './dto/football-feed.query.dto';

@Injectable()
export class FootballFeedService {
  constructor(private readonly af: ApiFootballService) {}

  private resolveLeagueId(dto: {
    league?: number;
    code?: string;
  }): number {
    if (dto.league != null && Number.isFinite(dto.league)) {
      return dto.league;
    }
    if (dto.code) {
      const id = leagueIdForCode(dto.code.toUpperCase());
      if (id == null) {
        throw new BadRequestException(`未知的联赛 code: ${dto.code}`);
      }
      return id;
    }
    throw new BadRequestException('请提供 query `league`（数字）或 `code`（如 PL）');
  }

  private leagueSeasonParams(dto: FootballFeedLeagueSeasonDto) {
    return {
      league: this.resolveLeagueId(dto),
      season: dto.season,
    };
  }

  /** 未开赛赛程列表（默认 status=NS）；返回上游完整 JSON（含 errors / paging / response） */
  async fixturesList(dto: FootballFeedFixturesQueryDto) {
    const league = this.resolveLeagueId(dto);
    const status =
      dto.status !== undefined && dto.status !== '' ? dto.status : 'NS';
    const params: Record<string, string | number | undefined> = {
      league,
      season: dto.season,
      page: dto.page ?? 1,
      status,
    };
    if (dto.from) params.from = dto.from;
    if (dto.to) params.to = dto.to;
    if (dto.timezone) params.timezone = dto.timezone;
    if (dto.next != null) params.next = dto.next;
    if (dto.round) params.round = dto.round;
    if (dto.team != null) params.team = dto.team;
    return this.af.passThroughGet('/fixtures', params);
  }

  /** 单场详情（与官方 `GET /fixtures?id=` 一致） */
  async fixtureDetail(fixtureId: number) {
    return this.af.passThroughGet('/fixtures', { id: fixtureId });
  }

  async fixtureLineups(dto: FootballFeedFixtureIdQueryDto) {
    return this.af.passThroughGet('/fixtures/lineups', {
      fixture: dto.fixture,
    });
  }

  async fixtureStatistics(dto: FootballFeedFixtureIdQueryDto) {
    return this.af.passThroughGet('/fixtures/statistics', {
      fixture: dto.fixture,
    });
  }

  async fixtureEvents(dto: FootballFeedFixtureIdQueryDto) {
    return this.af.passThroughGet('/fixtures/events', {
      fixture: dto.fixture,
    });
  }

  async fixturesHeadToHead(dto: FootballFeedH2hQueryDto) {
    const base = this.leagueSeasonParams(dto);
    return this.af.passThroughGet('/fixtures/headtohead', {
      ...base,
      h2h: dto.h2h,
      ...(dto.date ? { date: dto.date } : {}),
    });
  }

  async teamsInLeague(dto: FootballFeedLeagueSeasonDto) {
    const p = this.leagueSeasonParams(dto);
    return this.af.passThroughGet('/teams', p);
  }

  async playersByTeamSeason(dto: FootballFeedPlayersQueryDto) {
    return this.af.passThroughGet('/players', {
      team: dto.team,
      season: dto.season,
      page: dto.page ?? 1,
    });
  }

  async playerProfile(dto: FootballFeedPlayerProfileQueryDto) {
    return this.af.passThroughGet('/players/profiles', {
      player: dto.player,
    });
  }

  async playerSquads(dto: FootballFeedPlayerSquadsQueryDto) {
    return this.af.passThroughGet('/players/squads', { team: dto.team });
  }

  async playerSeasons(dto: FootballFeedPlayerSeasonsQueryDto) {
    return this.af.passThroughGet('/players/seasons', {
      player: dto.player,
    });
  }

  async topscorers(dto: FootballFeedTopscorersQueryDto) {
    return this.af.passThroughGet('/players/topscorers', {
      ...this.leagueSeasonParams(dto),
    });
  }

  async injuries(dto: FootballFeedInjuriesQueryDto) {
    const base = this.leagueSeasonParams(dto);
    const params: Record<string, string | number | undefined> = { ...base };
    if (dto.team != null) params.team = dto.team;
    if (dto.player != null) params.player = dto.player;
    if (dto.date) params.date = dto.date;
    if (dto.timezone) params.timezone = dto.timezone;
    return this.af.passThroughGet('/injuries', params);
  }

  async predictions(dto: FootballFeedPredictionsQueryDto) {
    return this.af.passThroughGet('/predictions', { fixture: dto.fixture });
  }

  async odds(dto: FootballFeedOddsQueryDto) {
    const params: Record<string, string | number | undefined> = {};
    if (dto.fixture != null) {
      params.fixture = dto.fixture;
    } else {
      if (dto.season == null) {
        throw new BadRequestException('无 `fixture` 时请提供 `season` 与 `league`/`code`');
      }
      params.season = dto.season;
      params.league = this.resolveLeagueId({
        league: dto.league,
        code: dto.code,
      });
    }
    if (dto.date) params.date = dto.date;
    if (dto.timezone) params.timezone = dto.timezone;
    return this.af.passThroughGet('/odds', params);
  }

  async standings(dto: FootballFeedStandingsQueryDto) {
    const p: Record<string, string | number | undefined> = {
      ...this.leagueSeasonParams(dto),
    };
    if (dto.team != null) p.team = dto.team;
    return this.af.passThroughGet('/standings', p);
  }

  async teamStatistics(dto: FootballFeedTeamStatisticsQueryDto) {
    const league = this.resolveLeagueId({
      league: dto.league,
      code: dto.code,
    });
    return this.af.passThroughGet('/teams/statistics', {
      team: dto.team,
      league,
      season: dto.season,
    });
  }
}
