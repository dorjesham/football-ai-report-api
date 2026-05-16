import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AiReportService } from '../ai-report/ai-report.service';
import {
  MatchIntelPipelineService,
  type MatchIntelPipelineOptions,
} from '../match-intel-pipeline/match-intel-pipeline.service';
import { FantasyService } from '../fantasy/fantasy.service';
import { FootballDataService } from '../football-data/football-data.service';
import { HeadToHeadService } from '../head-to-head/head-to-head.service';
import { MatchesService } from '../matches/matches.service';
import { PlayerIntelligenceService } from '../player-intelligence/player-intelligence.service';
import { PredictionService } from '../prediction/prediction.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicSourcesService } from '../public-sources/public-sources.service';
import { SocialGuideService } from '../social-guide/social-guide.service';
import { TacticsService } from '../tactics/tactics.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { WeatherService } from '../weather/weather.service';
import { RequestUser } from '../common/types/request-user.type';
import { DataIngestService } from '../data-ingest/data-ingest.service';
import { AutoIntelBatchService } from '../auto-intel/auto-intel-batch.service';
import { ApiFootballIngestService } from '../api-football/api-football-ingest.service';
import {
  shouldRunAfMatchFactsSync,
  shouldRunFootballDataIntelSync,
} from '../match-intel-pipeline/match-intel-sync-routing.util';

@Injectable()
export class AdminViewActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly footballData: FootballDataService,
    private readonly publicSources: PublicSourcesService,
    private readonly weather: WeatherService,
    private readonly prediction: PredictionService,
    private readonly playerIntel: PlayerIntelligenceService,
    private readonly tactics: TacticsService,
    private readonly fantasy: FantasyService,
    private readonly h2h: HeadToHeadService,
    private readonly social: SocialGuideService,
    private readonly aiReport: AiReportService,
    private readonly matches: MatchesService,
    private readonly tournaments: TournamentsService,
    private readonly intelPipeline: MatchIntelPipelineService,
    private readonly dataIngest: DataIngestService,
    private readonly autoIntel: AutoIntelBatchService,
    private readonly apiFootballIngest: ApiFootballIngestService,
  ) {}

  seedDefaultTournaments() {
    return this.tournaments.seedDefaults();
  }

  syncAllBasicFootball() {
    return this.footballData.syncAllBasic();
  }

  /** Dashboard：批量自动预测 / 全管线（与 Cron 同源逻辑，手动立即跑一轮） */
  runAutoIntelBatch(body: Record<string, unknown>) {
    const modeRaw = String(body.mode ?? 'prediction').toLowerCase();
    const mode = modeRaw === 'full' ? 'full' : 'prediction';
    const lookaheadHours = Math.min(
      168,
      Math.max(6, Number(body.lookaheadHours ?? body['lookahead-hours'] ?? 72) || 72),
    );
    const lookbackHours = Math.min(
      72,
      Math.max(0, Number(body.lookbackHours ?? body['lookback-hours'] ?? 12) || 12),
    );
    const maxMatches = Math.min(
      50,
      Math.max(1, Number(body.maxMatches ?? body['max-matches'] ?? 15) || 15),
    );
    const delayMs = Math.min(
      60_000,
      Math.max(0, Number(body.delayMs ?? body['delay-ms'] ?? 2000) || 2000),
    );
    const includeAiReport =
      body.includeAiReport === true ||
      body.includeAiReport === 'true' ||
      body['include-ai-report'] === '1' ||
      body['include-ai-report'] === 'on';
    /** full 管线默认跳过 AI 报告；勾选「含 AI 报告草稿」则跑 generate-report */
    const skipAiReport = mode === 'full' ? !includeAiReport : true;

    return this.autoIntel.runBatch({
      mode,
      lookaheadHours,
      lookbackHours,
      maxMatches,
      delayMs,
      skipAiReport,
      source: 'admin-view',
    });
  }

  private async competitionCodeForMatch(matchId: string): Promise<string> {
    const m = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { competition: true },
    });
    if (!m?.competition?.code) {
      throw new NotFoundException('比赛或赛事实例缺少 code，无法同步 football-data');
    }
    return m.competition.code;
  }

  async syncFootballMatchesForMatch(matchId: string) {
    const code = await this.competitionCodeForMatch(matchId);
    return this.footballData.syncMatchesByCode(code);
  }

  async syncFootballStandingsForMatch(matchId: string) {
    const code = await this.competitionCodeForMatch(matchId);
    return this.footballData.syncStandings(code);
  }

  /** 单场情报：API-Football（af-f-*）或 Football-Data（FD 主链） */
  async syncFdMatchIntel(matchId: string) {
    const m = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { externalId: true, dataSource: true },
    });
    if (!m) throw new NotFoundException('Match not found');
    if (shouldRunAfMatchFactsSync(m)) {
      return this.footballData.syncMatchAfFactsFromApiFootball(matchId);
    }
    if (shouldRunFootballDataIntelSync(m)) {
      return this.footballData.syncMatchIntelFromFootballData(matchId);
    }
    throw new BadRequestException(
      '无法同步单场情报：externalId 为空或非 FD/AF 主链（需 FD 数字 id 或 af-f-{fixtureId}）',
    );
  }

  /** Phase C：管线编排 + DeepSeek 联调（顺序执行，默认失败不阻断） */
  runIntelFullPipeline(matchId: string, opts?: MatchIntelPipelineOptions) {
    return this.intelPipeline.runFull(matchId, opts);
  }

  fetchPublicSources(matchId: string, opts?: { force?: boolean }) {
    return this.publicSources.fetchForMatch(matchId, { force: opts?.force === true });
  }

  listTeamsForCompetitionTool(competitionId: string, seasonId?: string) {
    return this.publicSources.listCompetitionTeamsForPublicFetch(competitionId, seasonId);
  }

  syncWeather(matchId: string) {
    return this.weather.syncForMatch(matchId);
  }

  generatePrediction(matchId: string) {
    return this.prediction.generateForMatch(matchId);
  }

  generatePlayerIntelligence(matchId: string) {
    return this.playerIntel.generate(matchId);
  }

  generateTactics(matchId: string) {
    return this.tactics.generate(matchId);
  }

  generateFantasy(matchId: string) {
    return this.fantasy.generate(matchId);
  }

  generateHeadToHead(matchId: string) {
    return this.h2h.generate(matchId);
  }

  generateSocialGuide(matchId: string) {
    return this.social.generate(matchId);
  }

  previewSocialPosterPrompt(matchId: string, customElements: string) {
    return this.social.previewPosterPrompt(matchId, customElements);
  }

  /** 使用当前登录管理员的用户身份扣海报额度（与小程序用户同源逻辑）。 */
  generateSocialPoster(matchId: string, adminUserId: string, customElements: string) {
    return this.social.generatePoster(matchId, adminUserId, customElements);
  }

  generateReport(matchId: string) {
    return this.aiReport.generate(matchId);
  }

  publishReport(matchId: string, admin: RequestUser) {
    return this.aiReport.publish(matchId, admin);
  }

  setFeatured(matchId: string, featured: boolean) {
    return this.matches.updateMatch(matchId, { isFeatured: featured });
  }

  listDataIngestJobs(take = 25) {
    return this.dataIngest.listRecentJobs(take);
  }

  runDataIngestFdFinished(codes: string[], dateFrom: string, dateTo: string) {
    return this.dataIngest.runFdFinishedJob({ codes, dateFrom, dateTo });
  }

  runDataIngestFdPlayerSquads(body: {
    codes: string[];
    delayBetweenTeamMs: number;
    delayBetweenPersonMs: number;
    enrichPerson: boolean;
    enrichCoach: boolean;
    coachMatchDetailSample: number;
    updateTeamMeta: boolean;
  }) {
    return this.dataIngest.runFdPlayerSquadsJob(body);
  }

  runDataIngestOpenFootball(body: {
    leagueKey: string;
    competitionCode: string;
    seasonFolder?: string;
    url?: string;
  }) {
    return this.dataIngest.runOpenFootballJob(body);
  }

  runDataIngestStatsbombOpenData(body: {
    sbCompetitionId: number;
    sbSeasonId: number;
    competitionCode: string;
    baseUrl?: string;
    maxMatches?: number;
    delayMs?: number;
    maxEventsStored?: number;
    skipCreateMatch?: boolean;
  }) {
    return this.dataIngest.runStatsbombOpenDataJob(body);
  }

  runDataIngestStatsbombBatch(body: {
    preset?: 'BIG5_EURO' | 'ALL_MAPPED';
    mappings?: { sbCompetitionId: number; competitionCode: string }[];
    competitionIdsAllow?: number[];
    seasonIdsAllow?: number[];
    maxPairs?: number;
    maxMatchesPerPair?: number;
    delayMs?: number;
    delayBetweenPairsMs?: number;
    maxEventsStored?: number;
    skipCreateMatch?: boolean;
    dryRun?: boolean;
    includeMatchCountsInDryRun?: boolean;
    dryRunProbeLimit?: number;
    dryRunProbeDelayMs?: number;
    baseUrl?: string;
  }) {
    return this.dataIngest.runStatsbombOpenDataBatchJob(body);
  }

  runDataIngestStructurePreview(rawText: string, hint?: string, maxAttempts?: number) {
    return this.dataIngest.structureRawPreview(rawText, { hint, maxAttempts });
  }

  getPlayerIngestAudit() {
    return this.dataIngest.getPlayerIngestAudit();
  }

  runDataIngestPlayerAudit() {
    return this.dataIngest.runPlayerIngestAuditJob();
  }

  runDataIngestApiFootballFixtures(body: {
    competitionCodes: string[];
    season: number;
    delayBetweenRequestsMs?: number;
    maxPagesPerLeague?: number;
  }) {
    return this.dataIngest.runApiFootballFixturesJob(body);
  }

  runDataIngestApiFootballSquads(body: {
    competitionCodes: string[];
    season: number;
    delayBetweenRequestsMs?: number;
    maxTeamsPerLeague?: number;
  }) {
    return this.dataIngest.runApiFootballSquadsJob(body);
  }

  /** 世界杯 API-Football 一键：赛程 + 阵容 + 单场 enrich（不经 DataIngest 任务表） */
  runWorldCupApiFootballFullBundle(body: {
    season: number;
    skipFixtures?: boolean;
    skipSquads?: boolean;
    skipWcProfiles?: boolean;
    skipEnrich?: boolean;
    maxMatchesForEnrich?: number;
    maxTeamsForWcProfiles?: number;
    delayBetweenRequestsMs?: number;
  }) {
    return this.apiFootballIngest.importWorldCupFullBundle({
      season: body.season,
      syncFixtures: !body.skipFixtures,
      syncSquads: !body.skipSquads,
      syncWcProfiles: !body.skipWcProfiles,
      enrichMatches: !body.skipEnrich,
      maxMatchesForEnrich: body.maxMatchesForEnrich,
      maxTeamsForWcProfiles: body.maxTeamsForWcProfiles,
      delayBetweenRequestsMs: body.delayBetweenRequestsMs,
    });
  }

  runDataIngestFbrefPlayersCsv(body: {
    csvText: string;
    competitionCode: string;
    seasonTag: string;
    originalFileName?: string;
  }) {
    return this.dataIngest.runFbrefPlayersCsvJob(body);
  }
}
