import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.type';
import { AuthService } from '../auth/auth.service';
import { RiskLevel } from '@prisma/client';
import { MatchLiveFactsIngestService } from '../match-live/match-live-facts-ingest.service';
import { MatchesService } from './matches.service';
import { UpdateMatchDto } from './dto/update-match.dto';
import { CdnCacheHeadersInterceptor } from '../common/interceptors/cdn-cache-headers.interceptor';

@ApiTags('matches')
@Controller('matches')
@UseInterceptors(CdnCacheHeadersInterceptor)
export class MatchesController {
  constructor(
    private readonly matches: MatchesService,
    private readonly auth: AuthService,
    private readonly liveFactsIngest: MatchLiveFactsIngestService,
  ) {}

  @Public()
  @Get()
  list(
    @Query('tournamentId') tournamentId?: string,
    @Query('competitionId') competitionId?: string,
    @Query('seasonId') seasonId?: string,
    @Query('status') status?: string,
  ) {
    return this.matches.findAll({ tournamentId, competitionId, seasonId, status });
  }

  @ApiBearerAuth()
  @Get(':id/unlock-status')
  unlockStatus(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.matches.unlockStatus(id, user.id);
  }

  @Public()
  @Get(':id/intel')
  @ApiOperation({
    summary: '赛前情报聚合（MatchIntel）',
    description:
      'Phase A：与 C 端线框对齐的稳定读模型。未解锁时 `paid` 为 null，`freeLayer.predictionPreview` 可展示模型一瞥；已解锁或管理员返回完整 `paid`。',
  })
  async intel(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const viewer = await this.auth.resolveUserFromAuthHeader(authorization);
    return this.matches.getMatchIntel(id, viewer);
  }

  @Public()
  @Get(':id/injuries')
  @ApiOperation({
    summary: '本场伤停（BFF，api-sports）',
    description: '浏览器勿直连 /football-feed/injuries；需场次 externalId 为 af-f-*。',
  })
  matchInjuries(@Param('id') id: string) {
    return this.matches.getMatchInjuries(id);
  }

  @Public()
  @Get(':id/analysis-preview')
  @ApiOperation({
    summary: '分析模块只读聚合（analysis-preview-v1）',
    description:
      '含 tactics、fantasy、headToHead/head_to_head、playerIntelligence.items；解锁边界与 GET /matches/:id/intel 一致。未解锁为 teaser（战术含 scenarioType，球员情报最多 3 条脱敏）。',
  })
  async analysisPreview(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const viewer = await this.auth.resolveUserFromAuthHeader(authorization);
    return this.matches.getAnalysisPreview(id, viewer);
  }

  @Public()
  @Get(':id/tactics')
  @ApiOperation({
    summary: '战术推演沙盘（v2 + 剧本卡片）',
    description: '解锁后返回完整 sandbox JSON；未解锁返回剧本摘要与沙盘 teaser。',
  })
  async tacticsBundle(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const viewer = await this.auth.resolveUserFromAuthHeader(authorization);
    return this.matches.getTacticsBundle(id, viewer);
  }

  @Public()
  @Get(':id/odds-snapshots')
  @ApiOperation({
    summary: '赔率快照只读（API-Football 技术快照）',
    description: '返回 T24/T1/LIVE 阶段 markets 与合规 disclaimer；非投注建议。',
  })
  oddsSnapshots(@Param('id') id: string) {
    return this.matches.getOddsSnapshotsForMatch(id);
  }

  @Public()
  @Get(':id')
  async detail(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const viewer = await this.auth.resolveUserFromAuthHeader(authorization);
    return this.matches.getMatchDetail(id, viewer);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @UseGuards(AdminGuard)
  @Post(':id/sync-live-facts')
  @ApiOperation({ summary: 'Admin：手动触发单场赛中事实增量同步' })
  syncLiveFacts(@Param('id') id: string) {
    return this.liveFactsIngest.syncLiveFactsForMatch(id, { force: true });
  }

  @ApiBearerAuth()
  @AdminOnly()
  @UseGuards(AdminGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateMatchDto) {
    return this.matches.updateMatch(id, body);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @UseGuards(AdminGuard)
  @Put(':id/team-snapshots')
  putTeamSnapshots(
    @Param('id') id: string,
    @Body()
    body: {
      snapshots: Array<{
        teamId: string;
        isHome: boolean;
        recentForm?: string;
        goalsForAvg?: number;
        goalsAgainstAvg?: number;
        attackRating?: number;
        defenseRating?: number;
      }>;
    },
  ) {
    return this.matches.replaceTeamSnapshots(id, body.snapshots || []);
  }

  @ApiBearerAuth()
  @AdminOnly()
  @UseGuards(AdminGuard)
  @Put(':id/player-snapshots')
  putPlayerSnapshots(
    @Param('id') id: string,
    @Body()
    body: {
      snapshots: Array<{
        playerId: string;
        teamId: string;
        expectedStartProbability?: number;
        riskLevel?: RiskLevel;
      }>;
    },
  ) {
    return this.matches.replacePlayerSnapshots(id, body.snapshots || []);
  }
}
