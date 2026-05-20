import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { CompetitionsService } from './competitions.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { UpdateCompetitionDto } from './dto/update-competition.dto';

@ApiTags('competitions')
@Controller('competitions')
export class CompetitionsController {
  constructor(private readonly competitions: CompetitionsService) {}

  @Public()
  @Get()
  list(
    @Query('tournamentId') tournamentId?: string,
    @Query('seasonId') seasonId?: string,
  ) {
    return this.competitions.findAll({ tournamentId, seasonId });
  }

  @Public()
  @Get('match-counts')
  @ApiOperation({
    summary: '按杯赛实例统计场次数量（侧边栏联赛计数）',
    description: '可选 from/to ISO、status、tournamentId、seasonId。',
  })
  matchCounts(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('tournamentId') tournamentId?: string,
    @Query('seasonId') seasonId?: string,
  ) {
    const st =
      status && (Object.values(MatchStatus) as string[]).includes(status) ?
        (status as MatchStatus)
      : undefined;
    return this.competitions.matchCounts({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      status: st,
      tournamentId,
      seasonId,
    });
  }

  /** 须写在 `worldcup2026-teams` 与 `:id` 之前，避免被泛化路由吞掉 */
  @Public()
  @Get(':id/worldcup2026-schedule/:teamId')
  @ApiOperation({
    summary: '2026 世界杯 · 单队正赛赛程',
    description:
      '读取 `Match` 表中 `competitionId` 且主或客为该队的场次；与 `wc2026Profile.recentInternational` 历史窗无关。无数据时 `matches` 为空数组。',
  })
  worldcup2026TeamSchedule(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
  ) {
    return this.competitions.getWorldCup2026TeamSchedule(id, teamId);
  }

  @Public()
  @Get(':id/worldcup2026-teams/:teamId')
  @ApiOperation({
    summary: '2026 世界杯 · 单支国家队详情',
    description:
      '与列表项相同字段；`slim=1` 时去掉 `recentInternational.matches`。运营文案、核心球员、战术、AI 战力等见 `wc2026Profile`（由 `wc2026_team_detail_overrides.json` 合并写入）。',
  })
  worldcup2026TeamOne(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Query('slim') slim?: string,
  ) {
    const slimOn = slim === '1' || slim === 'true';
    return this.competitions.getWorldCup2026Team(id, teamId, slimOn);
  }

  @Public()
  @Get(':id/worldcup2026-teams')
  @ApiOperation({
    summary: '2026 世界杯参赛队（含排名与近半年国际赛）',
    description:
      '数据来源：`worldcup2026_teams.json` + 可选 `wc2026_team_detail_overrides.json` 经 seed 写入 `Team`。`slim=1` 时省略 `recentInternational.matches`。',
  })
  worldcup2026Teams(
    @Param('id') id: string,
    @Query('slim') slim?: string,
  ) {
    const slimOn = slim === '1' || slim === 'true';
    return this.competitions.listWorldCup2026Teams(id, slimOn);
  }

  @Public()
  @Get(':id/standings')
  @ApiOperation({
    summary: '积分榜（由已完赛场次聚合）',
    description: '可选 `group` 与 `Match.groupName` 一致（如世界杯小组赛 `A`）。',
  })
  standings(@Param('id') id: string, @Query('group') group?: string) {
    return this.competitions.computeStandings(id, group);
  }

  @Public()
  @Get(':id')
  one(@Param('id') id: string) {
    return this.competitions.findOne(id);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @UseGuards(AdminGuard)
  @Post()
  create(@Body() dto: CreateCompetitionDto) {
    return this.competitions.create(dto);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @UseGuards(AdminGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCompetitionDto) {
    return this.competitions.update(id, dto);
  }
}
