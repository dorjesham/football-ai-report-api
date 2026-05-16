import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { MatchFactsCanonicalService } from '../match-facts/match-facts-canonical.service';
import { MatchFactsQualityService } from '../match-facts/match-facts-quality.service';
import { ApiFootballCostEstimatorService } from '../ops/api-football-cost-estimator.service';
import { PredictionGradingService } from '../prediction/prediction-grading.service';
import { DataIngestService } from './data-ingest.service';
import { RawPayloadStructureService } from './raw-payload-structure.service';
import {
  ApiFootballFixturesIngestDto,
  ApiFootballMatchFactsBatchDto,
  ApiFootballMatchFactsCoverageQueryDto,
  ApiFootballOddsCaptureBatchDto,
  ApiFootballPreMatchSnapshotBatchDto,
  ApiFootballSquadsIngestDto,
  PredictionGradingBatchDto,
  PredictionGradingSummaryQueryDto,
  PredictionInputCoverageQueryDto,
  FdFinishedIngestDto,
  FdPlayerSquadsIngestDto,
  OpenFootballIngestDto,
  StatsbombBatchIngestDto,
  StatsbombOpenDataIngestDto,
  StructureRawPayloadDto,
} from './dto/data-ingest.dto';
import { FOOTBALL_DATA_COMPETITION_CODES } from '../common/constants/competition.constant';

@ApiTags('admin')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard)
@Controller('admin/data-ingest')
export class DataIngestController {
  constructor(
    private readonly ingest: DataIngestService,
    private readonly rawStructure: RawPayloadStructureService,
    private readonly predictionGrading: PredictionGradingService,
    private readonly factsQuality: MatchFactsQualityService,
    private readonly factsCanonical: MatchFactsCanonicalService,
    private readonly afCost: ApiFootballCostEstimatorService,
  ) {}

  @Post('fd-finished')
  @ApiOperation({
    summary: 'Football-Data：按日期窗口回填已完赛比赛 + MatchFacts',
    description:
      '仅处理 FINISHED；需在本地已有对应 Competition.code。注意 API 配额。',
  })
  async fdFinished(@Body() body: FdFinishedIngestDto) {
    const codes =
      body.codes?.length ?
        body.codes
      : (['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL'] as const).filter((c) =>
          FOOTBALL_DATA_COMPETITION_CODES.includes(c),
        );
    return this.ingest.runFdFinishedJob({
      codes,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
    });
  }

  @Post('fd-player-squads')
  @ApiOperation({
    summary: 'Football-Data：按联赛拉取各队 squad + 可选 Person 详情 + 教练 coachProfile 入库',
    description:
      'GET /competitions/{code}/teams → 对每队 GET /teams/{id}：squad 写入 Player；同时将 coach 与可选 /persons、/matches、单场 /matches/{id} 阵型摘录合并写入 Team.coachProfile（见 tacticalSemantics 数据边界）。',
  })
  async fdPlayerSquads(@Body() body: FdPlayerSquadsIngestDto) {
    const codes =
      body.codes?.length ?
        body.codes
      : (['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL'] as const).filter((c) =>
          FOOTBALL_DATA_COMPETITION_CODES.includes(c),
        );
    return this.ingest.runFdPlayerSquadsJob({
      codes,
      delayBetweenTeamMs: body.delayBetweenTeamMs ?? 900,
      delayBetweenPersonMs: body.delayBetweenPersonMs ?? 350,
      enrichPerson: body.enrichPerson === true,
      enrichCoach: body.enrichCoach !== false,
      coachMatchDetailSample: body.coachMatchDetailSample ?? 5,
      updateTeamMeta: body.updateTeamMeta !== false,
    });
  }

  @Post('openfootball/league')
  @ApiOperation({
    summary: 'OpenFootball football.json：导入一届联赛 JSON（仅已有比分的场次）',
    description:
      '默认从 GitHub raw 拉取；competitionCode 须已在库中存在（如 PL）。',
  })
  async openFootballLeague(@Body() body: OpenFootballIngestDto) {
    return this.ingest.runOpenFootballJob(body);
  }

  @Post('statsbomb/open-data')
  @ApiOperation({
    summary: 'StatsBomb Open Data：按赛事/赛季拉 lineups+events 写入 MatchFacts.rawStatsbomb',
    description:
      '须遵守 https://github.com/statsbomb/open-data 许可。本地须已有 `Match`（如先跑 API-Football 赛程）；按 `statsbombMatchId` 或 赛日+队名 链接。`STATS_BOMB_OPEN_DATA_BASE_URL` 可覆盖默认 GitHub raw 根路径。',
  })
  async statsbombOpenData(@Body() body: StatsbombOpenDataIngestDto) {
    return this.ingest.runStatsbombOpenDataJob({
      sbCompetitionId: body.sbCompetitionId,
      sbSeasonId: body.sbSeasonId,
      competitionCode: body.competitionCode,
      baseUrl: body.baseUrl,
      maxMatches: body.maxMatches,
      delayMs: body.delayMs,
      maxEventsStored: body.maxEventsStored,
      skipCreateMatch: body.skipCreateMatch === true,
    });
  }

  @Get('statsbomb/catalog')
  @ApiOperation({
    summary: 'StatsBomb Open Data：读取 README 目录 competitions.json（可选探测各季 matches 场次数）',
    description:
      '默认仅返回目录与汇总。`?probe=1` 时对前 `probeLimit` 行请求 `matches/{cid}/{sid}.json` 只数组长（易触发 GitHub 限流，请配 `delayMs`）。',
  })
  async statsbombCatalog(
    @Query('baseUrl') baseUrl?: string,
    @Query('probe') probe?: string,
    @Query('probeLimit') probeLimit?: string,
    @Query('delayMs') delayMs?: string,
  ) {
    const probeLimitN = probeLimit ? parseInt(probeLimit, 10) : 20;
    const delayMsN = delayMs ? parseInt(delayMs, 10) : 280;
    return this.ingest.auditStatsbombOpenDataCatalog({
      baseUrl: baseUrl?.trim() || undefined,
      includeMatchFileCounts: probe === '1' || probe === 'true',
      probeLimit: Number.isFinite(probeLimitN) ? probeLimitN : 20,
      delayBetweenProbeMs: Number.isFinite(delayMsN) ? delayMsN : 280,
    });
  }

  @Post('statsbomb/batch')
  @ApiOperation({
    summary: 'StatsBomb Open Data：按 competitions.json 多季批量入库（或 dryRun 审计）',
    description:
      '须遵守 https://github.com/statsbomb/open-data 许可。`mappings` 将 SB `competition_id` 映射到本地 `Competition.code`；`maxPairs` 控制本任务批大小。写入 `IngestJobRun` kind=`STATSBOMB_OPEN_DATA_BATCH`。',
  })
  async statsbombBatch(@Body() body: StatsbombBatchIngestDto) {
    return this.ingest.runStatsbombOpenDataBatchJob({
      mappings: body.mappings,
      preset: body.preset,
      competitionIdsAllow: body.competitionIdsAllow,
      seasonIdsAllow: body.seasonIdsAllow,
      maxPairs: body.maxPairs,
      maxMatchesPerPair: body.maxMatchesPerPair,
      delayMs: body.delayMs,
      delayBetweenPairsMs: body.delayBetweenPairsMs,
      maxEventsStored: body.maxEventsStored,
      skipCreateMatch: body.skipCreateMatch === true,
      dryRun: body.dryRun === true,
      includeMatchCountsInDryRun: body.includeMatchCountsInDryRun === true,
      dryRunProbeLimit: body.dryRunProbeLimit,
      dryRunProbeDelayMs: body.dryRunProbeDelayMs,
      baseUrl: body.baseUrl,
    });
  }

  @Post('api-football/fixtures')
  @ApiOperation({
    summary: 'API-Football：同步 2025-26 等赛季的赛程/比分（主数据源）',
    description:
      '按 `Competition.code` 与内置联赛 id 映射拉取 `/fixtures` 全部分页；球队 `af-t-*`、场次 `af-f-*`。免费版每日约 100 次请求，请控制 codes 与 maxPagesPerLeague。',
  })
  async apiFootballFixtures(@Body() body: ApiFootballFixturesIngestDto) {
    const codes =
      body.codes?.length ?
        body.codes.map((c) => c.toUpperCase())
      : ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL', 'EL', 'UECL'];
    return this.ingest.runApiFootballFixturesJob({
      competitionCodes: codes,
      season: body.season,
      delayBetweenRequestsMs: body.delayBetweenRequestsMs,
      maxPagesPerLeague: body.maxPagesPerLeague,
    });
  }

  @Post('api-football/squads')
  @ApiOperation({
    summary: 'API-Football：同步联赛球队球员名单（依赖已写入的 af-t-* 球队）',
    description:
      '先跑 fixtures。按 `/teams` + `/players` 分页写入 `Player`（`af-p-*`、`profile.apiFootball`）。',
  })
  async apiFootballSquads(@Body() body: ApiFootballSquadsIngestDto) {
    const codes =
      body.codes?.length ?
        body.codes.map((c) => c.toUpperCase())
      : ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL', 'EL', 'UECL'];
    return this.ingest.runApiFootballSquadsJob({
      competitionCodes: codes,
      season: body.season,
      delayBetweenRequestsMs: body.delayBetweenRequestsMs,
      maxTeamsPerLeague: body.maxTeamsPerLeague,
    });
  }

  @Get('api-football/match-facts-coverage')
  @ApiOperation({
    summary: 'API-Football：MatchFacts 字段覆盖率（验收抽样）',
    description:
      '对近窗 `af-f-*` 场次抽样，统计 lineups/events/teamStats/rawAfFixture 非空率；返回缺失 matchId 样本。',
  })
  async apiFootballMatchFactsCoverage(@Query() query: ApiFootballMatchFactsCoverageQueryDto) {
    return this.ingest.getApiFootballMatchFactsCoverage({
      competitionId: query.competitionId,
      status: query.status,
      sample: query.sample,
      lookbackDays: query.lookbackDays,
    });
  }

  @Post('api-football/match-facts-batch')
  @ApiOperation({
    summary: 'API-Football：批量写入单场事实包（af-f-*）',
    description:
      '按条件选取 Match，对每场调用 fixture+lineups+events+statistics；写入 IngestJobRun kind=`API_FOOTBALL_MATCH_FACTS_BATCH`。默认 onlyMissing=true 跳过已写满场次。注意配额。',
  })
  async apiFootballMatchFactsBatch(@Body() body: ApiFootballMatchFactsBatchDto) {
    return this.ingest.runApiFootballMatchFactsBatchJob({
      competitionId: body.competitionId,
      status: body.status,
      maxMatches: body.maxMatches,
      delayBetweenMatchesMs: body.delayBetweenMatchesMs,
      onlyMissing: body.onlyMissing,
      lookbackDays: body.lookbackDays,
      force: body.force,
    });
  }

  @Get('prediction-input-coverage')
  @ApiOperation({
    summary: '预测/OLS 输入字段覆盖率（TeamMatchSnapshot + 赔率 T24/T1）',
  })
  async predictionInputCoverage(@Query() query: PredictionInputCoverageQueryDto) {
    return this.ingest.getPredictionInputCoverage({
      competitionId: query.competitionId,
      status: query.status,
      sample: query.sample,
      lookbackDays: query.lookbackDays,
    });
  }

  @Post('prediction/grade-batch')
  @ApiOperation({
    summary: '批量对账已完赛冻结预测（Brier/命中率/模拟 ROI）',
    description: '写入 IngestJobRun kind=`PREDICTION_GRADING_BATCH`。',
  })
  async predictionGradeBatch(@Body() body: PredictionGradingBatchDto) {
    return this.predictionGrading.gradeFinishedBatch({
      maxMatches: body.maxMatches,
      lookbackDays: body.lookbackDays,
    });
  }

  @Get('prediction/grading-summary')
  @ApiOperation({ summary: '预测对账汇总（近 N 场样本）' })
  async predictionGradingSummary(@Query() query: PredictionGradingSummaryQueryDto) {
    return this.predictionGrading.gradingSummary({
      sample: query.sample,
      lookbackDays: query.lookbackDays,
    });
  }

  @Post('api-football/pre-match-snapshot-batch')
  @ApiOperation({
    summary: 'API-Football：批量写入赛前球队/球员快照',
  })
  async apiFootballPreMatchSnapshotBatch(@Body() body: ApiFootballPreMatchSnapshotBatchDto) {
    return this.ingest.runApiFootballPreMatchSnapshotBatchJob(body);
  }

  @Post('api-football/odds-capture')
  @ApiOperation({
    summary: 'API-Football：批量抓取赔率快照',
  })
  async apiFootballOddsCapture(@Body() body: ApiFootballOddsCaptureBatchDto) {
    return this.ingest.runOddsCaptureBatchJob(body);
  }

  @Post('structure-raw')
  @ApiOperation({
    summary: 'DeepSeek：原始文本 → MatchFacts 部分 JSON（Zod 校验，失败重试）',
  })
  async structureRaw(@Body() body: StructureRawPayloadDto) {
    return this.rawStructure.structureMatchFactsEnvelope(body.rawText, {
      maxAttempts: body.maxAttempts,
      hint: body.hint,
    });
  }

  @Get('jobs/recent')
  @ApiOperation({ summary: '最近入库任务' })
  async recentJobs() {
    return this.ingest.listRecentJobs(30);
  }

  @Get('match-facts-quality/summary')
  @ApiOperation({ summary: 'MatchFacts 质量汇总（validatedAt / 覆盖率）' })
  matchFactsQualitySummary(@Query('lookbackDays') lookbackDays?: string) {
    const d = lookbackDays ? parseInt(lookbackDays, 10) : undefined;
    return this.factsQuality.qualitySummary({
      lookbackDays: Number.isFinite(d) ? d : undefined,
    });
  }

  @Get('match-facts-quality/anomalies')
  @ApiOperation({ summary: '异常场次列表（缺事实/滞后 LIVE/比分不一致等）' })
  matchFactsAnomalies(
    @Query('lookbackDays') lookbackDays?: string,
    @Query('max') max?: string,
    @Query('status') status?: string,
  ) {
    const lb = lookbackDays ? parseInt(lookbackDays, 10) : undefined;
    const m = max ? parseInt(max, 10) : undefined;
    return this.factsQuality.listAnomalies({
      lookbackDays: Number.isFinite(lb) ? lb : undefined,
      max: Number.isFinite(m) ? m : undefined,
      status: status as never,
    });
  }

  @Post('matches/:matchId/validate-facts')
  @ApiOperation({ summary: '单场 MatchFacts 质量校验并追加 validationLog' })
  validateMatchFacts(@Param('matchId') matchId: string) {
    return this.factsQuality.validateMatchFacts(matchId);
  }

  @Get('matches/:matchId/supplementary-facts')
  @ApiOperation({ summary: '查看 supplementaryFacts 参考层' })
  getSupplementary(@Param('matchId') matchId: string) {
    return this.factsQuality.getSupplementary(matchId);
  }

  @Post('matches/:matchId/promote-supplementary')
  @ApiOperation({
    summary: '人工确认：将 supplementary 字段提升为 canonical',
    description: 'body: { sourceKey: "STATSBOMB", fields: ["lineups"] }',
  })
  promoteSupplementary(
    @Param('matchId') matchId: string,
    @Body() body: { sourceKey: string; fields: Array<'lineups' | 'events' | 'teamStats'> },
  ) {
    return this.factsCanonical.promoteSupplementary(
      matchId,
      body.sourceKey,
      body.fields ?? [],
    );
  }

  @Get('api-football/cost-estimate')
  @ApiOperation({ summary: 'API-Football 日调用量估算（Cron + 当前 LIVE 场次）' })
  apiFootballCostEstimate(@Query('competitionCode') competitionCode?: string) {
    return this.afCost.estimateDaily({ competitionCode });
  }

  @Get('player-audit')
  @ApiOperation({
    summary: '球员数据：库内覆盖度与多源审计（只读）',
    description:
      '统计 Player 按 dataSource、profile.fdSquad / fdPerson / fbref / understat / transfermarkt 键、MatchFacts.lineups；探测默认 OpenFootball raw JSON；列出近期球员相关 IngestJobRun。',
  })
  async playerAudit() {
    return this.ingest.getPlayerIngestAudit();
  }

  @Post('player-audit/run')
  @ApiOperation({
    summary: '球员数据：执行审计并写入 IngestJobRun（PLAYER_DATA_AUDIT）',
  })
  async playerAuditRun() {
    return this.ingest.runPlayerIngestAuditJob();
  }

  @Post('fbref/players-csv')
  @ApiOperation({
    summary: 'FBref：上传球员统计 CSV（需含 Player + Squad 或 Team）',
    description:
      'multipart：字段 `file`（UTF-8 CSV）；`competitionCode`（库内 Competition.code）；`seasonTag`（写入 profile.fbref.seasons 的键，如 2024-25）。按该赛事下 Match 出现过的主客队匹配 Squad，再匹配球员姓名并合并 profile.fbref。',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'competitionCode', 'seasonTag'],
      properties: {
        file: { type: 'string', format: 'binary' },
        competitionCode: { type: 'string', example: 'PL' },
        seasonTag: { type: 'string', example: '2024-25' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  async fbrefPlayersCsv(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { competitionCode?: string; seasonTag?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('请上传 CSV 文件（表单字段名 file）');
    }
    const competitionCode = String(body.competitionCode ?? '').trim();
    const seasonTag = String(body.seasonTag ?? '').trim();
    if (!competitionCode || !seasonTag) {
      throw new BadRequestException('competitionCode 与 seasonTag 为必填字符串');
    }
    const csvText = file.buffer.toString('utf8');
    return this.ingest.runFbrefPlayersCsvJob({
      csvText,
      competitionCode,
      seasonTag,
      originalFileName: file.originalname,
    });
  }
}
