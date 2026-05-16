import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { FootballDataService } from './football-data.service';

@ApiTags('football-data')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard)
@Controller('football-data')
export class FootballDataController {
  constructor(private readonly footballData: FootballDataService) {}

  @Post('sync/competitions')
  syncCompetitions() {
    return this.footballData.syncCompetitions();
  }

  @Post('sync/competition/:code/matches')
  syncMatches(@Param('code') code: string) {
    return this.footballData.syncMatchesByCode(code);
  }

  @Post('sync/competition/:code/standings')
  syncStandings(@Param('code') code: string) {
    return this.footballData.syncStandings(code);
  }

  @Post('sync/all-basic')
  syncAll() {
    return this.footballData.syncAllBasic();
  }

  /** 单场：FD 详情 + 联赛样本 + 本库主场同月 + FD 大名单 lineup（需 match.externalId 为 Football-Data 数字 id） */
  @Post('sync/match/:matchId/intel')
  syncMatchIntel(@Param('matchId') matchId: string) {
    return this.footballData.syncMatchIntelFromFootballData(matchId);
  }

  @Post('sync/match/:matchId/af-facts')
  @ApiOperation({
    summary: '单场：API-Football 事实包（fixture/lineups/events/statistics）',
    description: '要求 Match.externalId 为 af-f-{fixtureId}；写入 MatchFacts.rawAfFixture 等。',
  })
  syncMatchAfFacts(@Param('matchId') matchId: string) {
    return this.footballData.syncMatchAfFactsFromApiFootball(matchId);
  }

  @Post('sync/match/:matchId/pre-match-snapshots')
  @ApiOperation({
    summary: '单场：API-Football 赛前球队/球员快照（积分榜/统计/伤停）',
    description: '要求 Match.externalId 为 af-f-*；写入 TeamMatchSnapshot / PlayerMatchSnapshot。',
  })
  syncPreMatchSnapshots(@Param('matchId') matchId: string) {
    return this.footballData.syncMatchPreMatchSnapshotsFromApiFootball(matchId, { force: true });
  }

  /**
   * 批量：对开球近窗内 `SCHEDULED`/`LIVE` 的比赛刷新比分与状态。
   * — Football-Data：`dataSource=FOOTBALL_DATA` 且有 FD `externalId`，单场 `GET /matches/{id}`（与 `syncMatchIntelFromFootballData` 同源）。
   * — API-Football：`externalId` 为 `af-f-*`，`GET /fixtures?id=`。
   * 与 Cron `pollFdRecentMatchStatus` 同源；用于 Cron 未开或需立即修库。
   */
  @Post('sync/poll-recent-match-status')
  @ApiOperation({
    summary: '近窗批量刷新比分/状态（Football-Data + API-Football 并存）',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        lookbackHours: { type: 'number', example: 20 },
        lookaheadMinutes: { type: 'number', example: 30 },
        maxMatches: { type: 'number', example: 20 },
        delayBetweenMs: { type: 'number', example: 650 },
      },
    },
  })
  pollRecentMatchStatus(
    @Body()
    body?: {
      lookbackHours?: number;
      lookaheadMinutes?: number;
      maxMatches?: number;
      delayBetweenMs?: number;
    },
  ) {
    return this.footballData.pollRecentMatchStatusNearWindow(body);
  }
}
