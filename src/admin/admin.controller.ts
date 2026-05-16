import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeepseekService } from '../ai-report/deepseek.service';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { ApiFootballService } from '../api-football/api-football.service';
import { ApiFootballIngestService } from '../api-football/api-football-ingest.service';
import { AutoIntelBatchService } from '../auto-intel/auto-intel-batch.service';
import { MatchIntelPipelineService } from '../match-intel-pipeline/match-intel-pipeline.service';
import { AdminService } from './admin.service';
import { AutoIntelRunDto } from './dto/auto-intel-run.dto';
import { StatsReportService } from '../stats/stats-report.service';
import { CreateProviderMappingDto } from './dto/create-provider-mapping.dto';
import { IntelPipelineRunDto } from './dto/intel-pipeline-run.dto';
import { UpdateWc2026TeamDetailDto } from './dto/update-wc2026-team-detail.dto';

@ApiTags('admin')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly intelPipeline: MatchIntelPipelineService,
    private readonly deepseek: DeepseekService,
    private readonly statsReport: StatsReportService,
    private readonly autoIntel: AutoIntelBatchService,
    private readonly apiFootball: ApiFootballService,
    private readonly apiFootballIngest: ApiFootballIngestService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Post('auto-intel/run')
  @HttpCode(200)
  @ApiOperation({
    summary: '批量自动情报/预测',
    description:
      '扫描「未来 lookahead 小时内、开球不早于 now−lookback、SCHEDULED/LIVE、尚无预测」的比赛；mode=prediction 仅 generate-prediction；mode=full 跑 Phase C 全管线（默认 skipAiReport=true）。',
  })
  runAutoIntel(@Body(new DefaultValuePipe({})) body: AutoIntelRunDto) {
    const mode = body.mode ?? 'prediction';
    return this.autoIntel.runBatch({
      mode,
      lookaheadHours: body.lookaheadHours ?? 72,
      lookbackHours: body.lookbackHours ?? 12,
      maxMatches: body.maxMatches ?? 15,
      delayMs: body.delayMs ?? 2000,
      skipAiReport: body.skipAiReport !== false,
      source: 'admin-api',
    });
  }

  @Get('match-data-report')
  @ApiOperation({
    summary: '只读：按赛事（Tournament）分类的比赛与球员扩展数据统计',
    description:
      '汇总各 Competition 下 Match 数量、按状态拆分、MatchFacts 场次数、数据来源（FD/MANUAL/WORLDFOOTBALL）计数；各杯赛 roster 去重球员数、PlayerMatchSnapshot / PlayerIntelligence 行数；全局 totals 含球员 profile / externalId / 快照与情报总量；playerData 含按 dataSource、position 分布与最近更新球员样本。',
  })
  matchDataReport() {
    return this.statsReport.getMatchDataOverview();
  }

  @Get('tournaments')
  tournaments() {
    return this.admin.listTournaments();
  }

  @Get('competitions')
  competitions() {
    return this.admin.listCompetitions();
  }

  @Get('seasons')
  seasons() {
    return this.admin.listSeasons();
  }

  @Get('matches')
  matches() {
    return this.admin.listMatches();
  }

  @Get('matches/:id')
  match(@Param('id') id: string) {
    return this.admin.getMatch(id);
  }

  @Post('matches/:id/pipeline/intel-full')
  @ApiOperation({
    summary: 'Phase C：单场情报全管线（顺序执行 + 落库审计）',
    description:
      '依次：DeepSeek smoke → API-Football 单场事实 → FD intel → 公开来源 → 天气 → AF 赛前快照 → 预测 → …。默认单步失败不中断。',
  })
  runIntelFullPipeline(
    @Param('id') id: string,
    @Body(new DefaultValuePipe({})) body: IntelPipelineRunDto,
  ) {
    return this.intelPipeline.runFull(id, {
      stopOnFailure: body?.stopOnFailure,
      skipAfFacts: body?.skipAfFacts,
      skipAfPreMatchSnapshots: body?.skipAfPreMatchSnapshots,
      skipFdIntel: body?.skipFdIntel,
      skipPublicSources: body?.skipPublicSources,
      skipWeather: body?.skipWeather,
      skipDeepseekSmoke: body?.skipDeepseekSmoke,
      skipAiReport: body?.skipAiReport,
    });
  }

  @Get('deepseek/smoke')
  @ApiOperation({ summary: 'DeepSeek 联调：一发最短 JSON 请求（mock 模式不访问网络）' })
  deepseekSmokePing() {
    return this.deepseek.smokePing();
  }

  @Get('api-football/status')
  @ApiOperation({
    summary: 'API-Football：GET /status 订阅与配额探活',
    description:
      '调用 api-sports 上游 `GET /status`（与 `API_FOOTBALL_BASE_URL` 一致），返回 `httpStatus` 与原始 `body`（含账号、剩余请求等）。用于开通付费套餐后验证 Key；结果写入 `ApiLog`（provider=api-football）。',
  })
  apiFootballStatus() {
    return this.apiFootball.getSubscriptionStatus();
  }

  @Post('api-football/world-cup/import-bundle')
  @HttpCode(200)
  @ApiOperation({
    summary: '世界杯：API-Football 一键入库',
    description:
      '顺序：WC league=1 赛程同步 → 全队列球员 → 单场 lineups/场地/主教练/主裁写入 MatchFacts 与 Team.coachProfile。需 `API_FOOTBALL_API_KEY`；`season` 如 2026 以 api-sports 为准。',
  })
  worldCupAfImportBundle(@Body() body: Record<string, unknown>) {
    const season = Math.trunc(Number(body.season ?? 2026) || 2026);
    const delayBetweenRequestsMs = Math.min(
      15_000,
      Math.max(0, Number(body.delayBetweenRequestsMs ?? 1500) || 1500),
    );
    const maxMatchesForEnrich = Math.min(
      128,
      Math.max(1, Number(body.maxMatchesForEnrich ?? 56) || 56),
    );
    const maxTeamsForWcProfiles = Math.min(
      64,
      Math.max(1, Number(body.maxTeamsForWcProfiles ?? body['max-teams-wc-profiles'] ?? 56) || 56),
    );
    return this.apiFootballIngest.importWorldCupFullBundle({
      season,
      syncFixtures: body.skipFixtures !== true && body['skip-fixtures'] !== '1',
      syncSquads: body.skipSquads !== true && body['skip-squads'] !== '1',
      syncWcProfiles:
        body.skipWcProfiles !== true &&
        body['skip-wc-profiles'] !== '1' &&
        body.skipWcProfile !== true,
      enrichMatches: body.skipEnrich !== true && body['skip-enrich'] !== '1',
      maxMatchesForEnrich,
      maxTeamsForWcProfiles,
      delayBetweenRequestsMs,
    });
  }

  @Patch('worldcup2026-teams/:teamId')
  @HttpCode(200)
  @ApiOperation({
    summary: '更新 2026 世界杯国家队展示扩展字段',
    description:
      '仅允许 `externalId` 前缀 `wc26-` 的 `Team`。写入 `wc2026Profile` 内运营键及可选 `founded`；FIFA/Elo/近期赛等仍由 seed 主 JSON 维护。',
  })
  patchWc2026Team(
    @Param('teamId') teamId: string,
    @Body() dto: UpdateWc2026TeamDetailDto,
  ) {
    return this.admin.patchWc2026TeamDetail(teamId, dto);
  }

  @Post('tournaments/seed-default')
  seed() {
    return this.admin.seedTournaments();
  }

  @Get('orders')
  orders() {
    return this.admin.listOrders();
  }

  @Get('unlocks')
  unlocks() {
    return this.admin.listUnlocks();
  }

  @Get('sources')
  sources() {
    return this.admin.listSources();
  }

  @Get('provider-mappings')
  providerMappings() {
    return this.admin.listProviderMappings();
  }

  @Post('provider-mappings')
  createProviderMapping(@Body() dto: CreateProviderMappingDto) {
    return this.admin.createProviderMapping(dto);
  }

  @Get('api-logs')
  apiLogs() {
    return this.admin.listApiLogs();
  }
}
