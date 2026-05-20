import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import {
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
import { FootballFeedService } from './football-feed.service';

@ApiTags('football-feed')
@Public()
@Throttle({ default: { limit: 180, ttl: 60_000 } })
@Controller('football-feed')
export class FootballFeedController {
  constructor(
    private readonly feed: FootballFeedService,
    private readonly config: ConfigService,
  ) {}

  private assertFeedPublic() {
    const isProd = this.config.get<string>('nodeEnv') === 'production';
    const allowed = this.config.get<boolean>('enableFootballFeedPublic') === true;
    if (isProd && !allowed) {
      throw new ForbiddenException(
        '生产环境已关闭 /football-feed 直连上游，请使用 BFF：/matches、/leagues/standings、/rankings/players 等。',
      );
    }
  }

  @Get('fixtures')
  @ApiOperation({
    summary: '赛程列表（上游 GET /fixtures）',
    description:
      '需 `season` + `league` 或 `code`（PL/PD/…）。未传 `status` 时默认 `NS`（未开赛）。返回体与 api-sports 一致：`get`/`parameters`/`errors`/`results`/`paging`/`response`。',
  })
  fixtures(@Query() q: FootballFeedFixturesQueryDto) {
    this.assertFeedPublic();
    return this.feed.fixturesList(q);
  }

  @Get('fixtures/lineups')
  @ApiOperation({ summary: '首发阵容（上游 /fixtures/lineups）' })
  fixtureLineups(@Query() q: FootballFeedFixtureIdQueryDto) {
    this.assertFeedPublic();
    return this.feed.fixtureLineups(q);
  }

  @Get('fixtures/statistics')
  @ApiOperation({ summary: '单场统计（上游 /fixtures/statistics）' })
  fixtureStatistics(@Query() q: FootballFeedFixtureIdQueryDto) {
    this.assertFeedPublic();
    return this.feed.fixtureStatistics(q);
  }

  @Get('fixtures/events')
  @ApiOperation({ summary: '单场事件（上游 /fixtures/events）' })
  fixtureEvents(@Query() q: FootballFeedFixtureIdQueryDto) {
    this.assertFeedPublic();
    return this.feed.fixtureEvents(q);
  }

  @Get('fixtures/players')
  @ApiOperation({ summary: '单场球员统计（上游 /fixtures/players）' })
  fixturePlayers(@Query() q: FootballFeedFixtureIdQueryDto) {
    this.assertFeedPublic();
    return this.feed.fixturePlayers(q);
  }

  @Get('fixtures/h2h')
  @ApiOperation({ summary: '交手历史（上游 /fixtures/headtohead）' })
  fixturesH2h(@Query() q: FootballFeedH2hQueryDto) {
    this.assertFeedPublic();
    return this.feed.fixturesHeadToHead(q);
  }

  @Get('fixtures/detail/:fixtureId')
  @ApiOperation({
    summary: '单场详情（上游 GET /fixtures?id=）',
    description: '与列表单项结构一致，含 teams、league、fixture、predictions 等字段（以官方为准）。',
  })
  fixtureDetail(@Param('fixtureId', ParseIntPipe) fixtureId: number) {
    this.assertFeedPublic();
    return this.feed.fixtureDetail(fixtureId);
  }

  @Get('teams')
  @ApiOperation({
    summary: '联赛球队列表（上游 GET /teams）',
    description: '用于拿 `team.id` 再调 `/football-feed/players`。',
  })
  teams(@Query() q: FootballFeedLeagueSeasonDto) {
    this.assertFeedPublic();
    return this.feed.teamsInLeague(q);
  }

  @Get('teams/statistics')
  @ApiOperation({ summary: '球队赛季统计（上游 /teams/statistics）' })
  teamStatistics(@Query() q: FootballFeedTeamStatisticsQueryDto) {
    this.assertFeedPublic();
    return this.feed.teamStatistics(q);
  }

  @Get('players')
  @ApiOperation({
    summary: '球员分页列表（上游 GET /players）',
    description: '按队+赛季，含 `statistics` 等；分页见 `paging`。',
  })
  players(@Query() q: FootballFeedPlayersQueryDto) {
    this.assertFeedPublic();
    return this.feed.playersByTeamSeason(q);
  }

  @Get('players/profiles')
  @ApiOperation({ summary: '球员档案详情（上游 /players/profiles）' })
  playerProfiles(@Query() q: FootballFeedPlayerProfileQueryDto) {
    this.assertFeedPublic();
    return this.feed.playerProfile(q);
  }

  @Get('players/squads')
  @ApiOperation({ summary: '阵容名单（上游 /players/squads）' })
  playerSquads(@Query() q: FootballFeedPlayerSquadsQueryDto) {
    this.assertFeedPublic();
    return this.feed.playerSquads(q);
  }

  @Get('players/seasons')
  @ApiOperation({ summary: '球员可用赛季（上游 /players/seasons）' })
  playerSeasons(@Query() q: FootballFeedPlayerSeasonsQueryDto) {
    this.assertFeedPublic();
    return this.feed.playerSeasons(q);
  }

  @Get('players/topscorers')
  @ApiOperation({ summary: '联赛射手榜（上游 /players/topscorers）' })
  topscorers(@Query() q: FootballFeedTopscorersQueryDto) {
    this.assertFeedPublic();
    return this.feed.topscorers(q);
  }

  @Get('injuries')
  @ApiOperation({ summary: '伤停（上游 /injuries）' })
  injuries(@Query() q: FootballFeedInjuriesQueryDto) {
    this.assertFeedPublic();
    return this.feed.injuries(q);
  }

  @Get('predictions')
  @ApiOperation({ summary: '赛前预测（上游 /predictions）' })
  predictions(@Query() q: FootballFeedPredictionsQueryDto) {
    this.assertFeedPublic();
    return this.feed.predictions(q);
  }

  @Get('odds')
  @ApiOperation({
    summary: '赔率（上游 /odds）',
    description: '可传 `fixture`，或 `season`+`league`/`code` 按联赛日查询（以官方参数为准）。',
  })
  odds(@Query() q: FootballFeedOddsQueryDto) {
    this.assertFeedPublic();
    return this.feed.odds(q);
  }

  @Get('standings')
  @ApiOperation({ summary: '积分榜（上游 /standings）' })
  standings(@Query() q: FootballFeedStandingsQueryDto) {
    this.assertFeedPublic();
    return this.feed.standings(q);
  }
}
