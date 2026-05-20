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
import { DeepseekService } from '../deepseek/deepseek.service';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { ApiFootballService } from '../api-football/api-football.service';
import { ApiFootballIngestService } from '../api-football/api-football-ingest.service';
import { ApiFootballQuotaService } from '../api-football/api-football-quota.service';
import { AutoIntelBatchService } from '../auto-intel/auto-intel-batch.service';
import { throwLegacyPipelineRetired } from '../common/errors/legacy-pipeline-retired.error';
import { AdminService } from './admin.service';
import { AutoIntelRunDto } from './dto/auto-intel-run.dto';
import { StatsReportService } from '../stats/stats-report.service';
import { CreateProviderMappingDto } from './dto/create-provider-mapping.dto';
import { UpdateWc2026TeamDetailDto } from './dto/update-wc2026-team-detail.dto';

@ApiTags('admin')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly deepseek: DeepseekService,
    private readonly statsReport: StatsReportService,
    private readonly autoIntel: AutoIntelBatchService,
    private readonly apiFootball: ApiFootballService,
    private readonly apiFootballIngest: ApiFootballIngestService,
    private readonly afQuota: ApiFootballQuotaService,
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
  runIntelFullPipeline() {
    throwLegacyPipelineRetired();
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

  @Get('api-football/quota')
  @ApiOperation({
    summary: 'API-Football 日配额（Redis 计数）',
    description:
      '返回当日已用/上限/剩余；键 `football:af:quota:YYYY-MM-DD`（前缀见 REDIS_KEY_PREFIX）。',
  })
  getApiFootballQuota() {
    return this.afQuota.snapshot();
  }

  @Patch('worldcup2026-teams/:teamId')
  @HttpCode(200)
  @ApiOperation({
    summary: '更新 2026 世界杯国家队展示扩展字段',
    description:
      '仅允许 `externalId` 前缀 `af-t-` 的 `Team`。写入 `wc2026Profile.manual` 运营键及可选 `founded`；事实数据来自 API-Football。',
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
