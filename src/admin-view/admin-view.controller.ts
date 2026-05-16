import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { User } from '@prisma/client';
import { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { SkipEnvelope } from '../common/decorators/skip-envelope.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from '../admin/admin.service';
import { AdminViewActionService } from './admin-view-action.service';
import { AdminViewAuthService } from './admin-view-auth.service';
import { PasswordLoginDto } from './dto/password-login.dto';
import { SetSessionDto } from './dto/set-session.dto';
import { CompetitionsService } from '../competitions/competitions.service';
import { UpdateWc2026TeamDetailDto } from '../admin/dto/update-wc2026-team-detail.dto';
import { FootballDataService } from '../football-data/football-data.service';
import { ScheduleAuditService } from '../football-data/schedule-audit.service';
import { StatsReportService } from '../stats/stats-report.service';
import type { StatsbombAutoMapPreset } from '../common/constants/statsbomb-auto-map.constant';

function actionErrorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === 'string') return m.slice(0, 400);
  }
  return String(e).slice(0, 400);
}

@ApiTags('admin-view')
@Public()
@Throttle({ default: { limit: 6000, ttl: 60000 } })
@SkipEnvelope()
@Controller('admin-view')
export class AdminViewController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
    private readonly auth: AdminViewAuthService,
    private readonly actions: AdminViewActionService,
    private readonly config: ConfigService,
    private readonly competitionsSvc: CompetitionsService,
    private readonly scheduleAudit: ScheduleAuditService,
    private readonly statsReport: StatsReportService,
    private readonly footballData: FootballDataService,
  ) {}

  private async requireAdmin(
    req: Request,
    token: string | undefined,
    res: Response,
  ): Promise<User | null> {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) {
      res.redirect(302, `${this.adminViewPathPrefix()}/login`);
      return null;
    }
    return user;
  }

  private redirectMatch(
    res: Response,
    matchId: string,
    ok: boolean,
    text: string,
  ) {
    const q = ok
      ? `msg=${encodeURIComponent(text)}`
      : `err=${encodeURIComponent(text)}`;
    const base = this.adminViewPathPrefix();
    res.redirect(
      302,
      `${base}/matches/${encodeURIComponent(matchId)}?${q}`,
    );
  }

  private redirectDashboard(res: Response, ok: boolean, text: string) {
    const q = ok
      ? `msg=${encodeURIComponent(text)}`
      : `err=${encodeURIComponent(text)}`;
    const base = this.adminViewPathPrefix();
    res.redirect(302, `${base}?${q}`);
  }

  private redirectDataIngest(res: Response, ok: boolean, text: string) {
    const q = ok
      ? `msg=${encodeURIComponent(text)}`
      : `err=${encodeURIComponent(text)}`;
    const base = this.adminViewPathPrefix();
    res.redirect(302, `${base}/data-ingest?${q}`);
  }

  private redirectPlayerData(res: Response, ok: boolean, text: string) {
    const q = ok
      ? `msg=${encodeURIComponent(text)}`
      : `err=${encodeURIComponent(text)}`;
    const base = this.adminViewPathPrefix();
    res.redirect(302, `${base}/player-data?${q}`);
  }

  private redirectCompetitionTools(
    res: Response,
    competitionId: string,
    ok: boolean,
    text: string,
  ) {
    const q = ok
      ? `msg=${encodeURIComponent(text)}`
      : `err=${encodeURIComponent(text)}`;
    const base = this.adminViewPathPrefix();
    res.redirect(
      302,
      `${base}/competitions/${encodeURIComponent(competitionId)}/tools?${q}`,
    );
  }

  private parseFdCodesFromBody(body: Record<string, unknown>): string[] {
    const raw = body.codes ?? body['fd-codes'];
    if (Array.isArray(raw)) {
      return raw.map((x) => String(x).trim()).filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim()) {
      return raw
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }

  /** 与浏览器打开的 AdminView 根路径一致（见 ADMIN_VIEW_PATH_PREFIX）。 */
  private adminViewPathPrefix(): string {
    return (
      this.config.get<string>('adminViewPathPrefix')?.replace(/\/$/, '') ||
      '/admin-view'
    );
  }

  private pathPrefixLocals(): { adminViewPathPrefix: string } {
    return { adminViewPathPrefix: this.adminViewPathPrefix() };
  }

  /** 数据入库页环境提示（含当前进程解析的 API-Football 基地址） */
  private dataIngestEnvHints() {
    return {
      hasApiFootballKey: !!this.config.get<string>('apiFootballApiKey')?.trim(),
      hasFootballDataKey: !!this.config.get<string>('footballDataApiKey'),
      hasDeepseekKey: !!this.config.get<string>('deepseekApiKey'),
      enableMockDeepseek: this.config.get<boolean>('enableMockDeepseek') === true,
      apiFootballBaseUrl:
        this.config.get<string>('apiFootballBaseUrl')?.trim() ||
        'https://v3.football.api-sports.io',
      statsBombOpenDataBaseUrl:
        this.config.get<string>('statsBombOpenDataBaseUrl')?.trim() ||
        'https://raw.githubusercontent.com/statsbomb/open-data/master/data',
    };
  }

  private parseWc2026TeamDetailDtoFromForm(
    body: Record<string, unknown>,
  ): UpdateWc2026TeamDetailDto {
    const dto = new UpdateWc2026TeamDetailDto();
    const s = (k: string): string | undefined => {
      const v = body[k];
      if (v === undefined || v === null) return undefined;
      const t = String(v).trim();
      return t === '' ? undefined : t;
    };
    dto.marketingSummary = s('marketingSummary');
    dto.aiInsight = s('aiInsight');
    dto.contentVersion = s('contentVersion');
    dto.headCoachName = s('headCoachName');
    dto.qualificationLabel = s('qualificationLabel');
    dto.regionDisplayName = s('regionDisplayName');
    const tags = s('tacticalTags');
    if (tags) {
      dto.tacticalTags = tags
        .split(/[,，]/)
        .map((x) => x.trim())
        .filter(Boolean);
    }
    const parseJson = (raw: string | undefined, label: string) => {
      if (!raw) return undefined;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        throw new BadRequestException(`${label} 不是合法 JSON`);
      }
    };
    const kp = parseJson(s('keyPlayersJson'), 'keyPlayersJson');
    if (kp !== undefined) {
      if (!Array.isArray(kp)) throw new BadRequestException('keyPlayersJson 须为 JSON 数组');
      dto.keyPlayers = kp;
    }
    const tp = parseJson(s('tacticalPitchJson'), 'tacticalPitchJson');
    if (tp !== undefined) {
      if (!tp || typeof tp !== 'object' || Array.isArray(tp)) {
        throw new BadRequestException('tacticalPitchJson 须为 JSON 对象');
      }
      dto.tacticalPitch = tp as Record<string, unknown>;
    }
    const ap = parseJson(s('aiPowerScoreJson'), 'aiPowerScoreJson');
    if (ap !== undefined) {
      if (!ap || typeof ap !== 'object' || Array.isArray(ap)) {
        throw new BadRequestException('aiPowerScoreJson 须为 JSON 对象');
      }
      dto.aiPowerScore = ap as Record<string, unknown>;
    }
    const fd = s('founded');
    if (fd !== undefined) {
      const n = parseInt(fd, 10);
      if (!Number.isFinite(n)) throw new BadRequestException('founded 须为整数');
      dto.founded = n;
    }
    return dto;
  }

  @Get('login')
  login(
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    return res.render('admin/login', {
      title: '运维后台登录',
      adminViewPathPrefix: this.adminViewPathPrefix(),
      error:
        error === '1'
          ? '用户名或密码错误，或未配置后台密码登录（环境变量 ADMIN_VIEW_LOGIN_*）。'
          : undefined,
      passwordLoginEnabled: this.auth.passwordLoginConfigured(),
    });
  }

  @Post('password-login')
  async passwordLogin(
    @Body() body: PasswordLoginDto,
    @Res() res: Response,
  ) {
    const token = await this.auth.signAdminTokenIfPasswordValid(
      body.username,
      body.password,
    );
    if (!token) {
      return res.redirect(302, `${this.adminViewPathPrefix()}/login?error=1`);
    }
    res.cookie('admin_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000,
      path: '/',
    });
    return res.redirect(302, this.adminViewPathPrefix());
  }

  @Post('session')
  async setSession(@Body() body: SetSessionDto, @Res() res: Response) {
    res.cookie('admin_token', body.token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000,
      path: '/',
    });
    return res.redirect(302, this.adminViewPathPrefix());
  }

  @Post(['dashboard/actions/seed-tournaments', 'dashboard/seed-tournaments'])
  async dashSeedTournaments(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    try {
      await this.actions.seedDefaultTournaments();
      this.redirectDashboard(res, true, '默认赛事已写入/更新');
    } catch (e) {
      this.redirectDashboard(res, false, actionErrorMessage(e));
    }
  }

  @Post([
    'dashboard/actions/sync-all-basic',
    'dashboard/sync-all-basic',
  ])
  async dashSyncAllBasic(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    try {
      await this.actions.syncAllBasicFootball();
      this.redirectDashboard(res, true, 'football-data 全量基础同步已触发');
    } catch (e) {
      this.redirectDashboard(res, false, actionErrorMessage(e));
    }
  }

  @Post('dashboard/actions/auto-intel-run')
  async dashAutoIntelRun(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    try {
      const out = await this.actions.runAutoIntelBatch(body);
      const failNote =
        out.failed.length > 0
          ? `；失败 ${out.failed.length} 场（首条：${out.failed[0]!.matchId} ${out.failed[0]!.error.slice(0, 80)}）`
          : '';
      this.redirectDashboard(
        res,
        true,
        `自动情报已执行：mode=${out.mode} 候选=${out.candidates} 成功=${out.succeeded} 失败=${out.failed.length}${failNote}`,
      );
    } catch (e) {
      this.redirectDashboard(res, false, actionErrorMessage(e));
    }
  }

  @Get()
  async dashboard(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Query('msg') msg: string | undefined,
    @Query('err') err: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) {
      return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    }
    const dash = await this.admin.dashboard();
    const envHints = {
      enableCronSync: this.config.get<boolean>('enableCronSync') === true,
      enablePublicSourceFetch:
        this.config.get<boolean>('enablePublicSourceFetch') === true,
      enableMockDeepseek: this.config.get<boolean>('enableMockDeepseek') === true,
      hasApiFootballKey: !!this.config.get<string>('apiFootballApiKey')?.trim(),
      hasFootballDataKey: !!this.config.get<string>('footballDataApiKey'),
      hasDeepseekKey: !!this.config.get<string>('deepseekApiKey'),
      hasQweather: !!(
        this.config.get<string>('qweatherApiKey') ||
        this.config.get<string>('qweatherCredentialId')
      ),
      posterImageMock: this.config.get<boolean>('enablePosterImageMock') === true,
      posterDevBypass: this.config.get<boolean>('enablePosterDevBypass') === true,
      hasGptImage2Key: !!this.config.get<string>('gptImage2ApiKey'),
      autoIntelCronMode: (this.config.get<string>('autoIntelCronMode') || 'off').toLowerCase(),
      autoIntelCronActive:
        this.config.get<boolean>('enableCronSync') === true &&
        ['prediction', 'full'].includes(
          (this.config.get<string>('autoIntelCronMode') || 'off').toLowerCase(),
        ),
    };
    return res.render('admin/dashboard', {
      title: '运维中心',
      flashMsg: msg,
      flashErr: err,
      envHints,
      ...dash,
      ...this.pathPrefixLocals(),
    });
  }

  @Get('tournaments')
  async tournaments(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const rows = await this.admin.listTournaments();
    return res.render('admin/table', {
      title: '赛事（Tournament）',
      columns: ['code', 'nameCn', 'nameEn', 'type', 'level', 'isActive'],
      rows,
      ...this.pathPrefixLocals(),
    });
  }

  @Get('competitions')
  async competitions(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const rows = await this.admin.listCompetitions();
    return res.render('admin/competitions', {
      title: '赛事实例（Competition）',
      rows,
      ...this.pathPrefixLocals(),
    });
  }

  @Get('schedule-audit')
  async scheduleAuditPage(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Query('err') err: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    return res.render('admin/schedule-audit', {
      title: '赛程/比分审计',
      flashErr: err,
      lastReport: null as unknown,
      lastReportJson: '',
      form: {
        mode: 'wc-pairs',
        competitionId: 'seed-comp-wc',
        fdCode: 'WC',
        dateFrom: '2026-06-01',
        dateTo: '2026-07-31',
        kickoffToleranceMin: '3',
      },
      ...this.pathPrefixLocals(),
    });
  }

  @Post('schedule-audit/run')
  async scheduleAuditRun(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const b = body || {};
    const mode = String(b.mode || 'wc-pairs').trim();
    const competitionId = String(
      b.competitionId ?? b['competition-id'] ?? 'seed-comp-wc',
    ).trim();
    const tol = Number(b.kickoffToleranceMin ?? b['kickoff-tolerance-min'] ?? 3);
    const kickoffToleranceMin = Number.isFinite(tol) ? tol : 3;
    try {
      let report: unknown;
      if (mode === 'fd-external-id') {
        report = await this.scheduleAudit.auditByFdMatchExternalId({
          competitionId,
          kickoffToleranceMin,
        });
      } else {
        report = await this.scheduleAudit.auditWcPairs({
          competitionId,
          fdCode: String(b.fdCode ?? b['fd-code'] ?? 'WC').trim(),
          dateFrom: String(b.dateFrom ?? b['date-from'] ?? '2026-06-01').trim(),
          dateTo: String(b.dateTo ?? b['date-to'] ?? '2026-07-31').trim(),
          kickoffToleranceMin,
        });
      }
      return res.render('admin/schedule-audit', {
        title: '赛程/比分审计',
        flashErr: undefined,
        lastReport: report,
        lastReportJson: JSON.stringify(report, null, 2),
        form: {
          mode,
          competitionId,
          fdCode: String(b.fdCode ?? b['fd-code'] ?? 'WC'),
          dateFrom: String(b.dateFrom ?? b['date-from'] ?? '2026-06-01'),
          dateTo: String(b.dateTo ?? b['date-to'] ?? '2026-07-31'),
          kickoffToleranceMin: String(kickoffToleranceMin),
        },
        ...this.pathPrefixLocals(),
      });
    } catch (e) {
      const base = this.adminViewPathPrefix();
      return res.redirect(
        302,
        `${base}/schedule-audit?err=${encodeURIComponent(actionErrorMessage(e))}`,
      );
    }
  }

  @Get('data-ingest')
  async dataIngestPage(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Query('msg') msg: string | undefined,
    @Query('err') err: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const [finishedMatchCount, matchFactsCount, ingestJobCount, playerCount] =
      await Promise.all([
        this.prisma.match.count({ where: { status: 'FINISHED' } }),
        this.prisma.matchFacts.count(),
        this.prisma.ingestJobRun.count(),
        this.prisma.player.count(),
      ]);
    const recentJobs = await this.actions.listDataIngestJobs(25);
    return res.render('admin/data-ingest', {
      title: '数据入库 · API-Football / FD / OpenFootball / StatsBomb',
      flashMsg: msg,
      flashErr: err,
      stats: {
        finishedMatchCount,
        matchFactsCount,
        ingestJobCount,
        playerCount,
      },
      recentJobs,
      structurePreviewJson: '',
      envHints: this.dataIngestEnvHints(),
      ...this.pathPrefixLocals(),
    });
  }

  @Get('player-data')
  async playerDataPage(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Query('msg') msg: string | undefined,
    @Query('err') err: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const audit = await this.actions.getPlayerIngestAudit();
    return res.render('admin/player-data', {
      title: '球员数据 · 多源与审计',
      flashMsg: msg,
      flashErr: err,
      audit,
      envHints: {
        hasApiFootballKey: !!this.config.get<string>('apiFootballApiKey')?.trim(),
        hasFootballDataKey: !!this.config.get<string>('footballDataApiKey'),
      },
      ...this.pathPrefixLocals(),
    });
  }

  @Post('player-data/actions/run-audit')
  async playerDataRunAudit(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    try {
      const out = await this.actions.runDataIngestPlayerAudit();
      this.redirectPlayerData(
        res,
        true,
        `审计已完成并写入 IngestJobRun（PLAYER_DATA_AUDIT）。jobId=${out.jobId}。`,
      );
    } catch (e) {
      this.redirectPlayerData(res, false, actionErrorMessage(e));
    }
  }

  @Post('player-data/actions/fbref-csv')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  async playerDataFbrefCsv(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    if (!file?.buffer?.length) {
      this.redirectPlayerData(res, false, '请选择要上传的 CSV 文件（字段名 file）');
      return;
    }
    const competitionCode = String(
      body.competitionCode ?? body['competition-code'] ?? '',
    ).trim();
    const seasonTag = String(body.seasonTag ?? body['season-tag'] ?? '').trim();
    if (!competitionCode || !seasonTag) {
      this.redirectPlayerData(res, false, '请填写 competitionCode 与 seasonTag');
      return;
    }
    try {
      const csvText = file.buffer.toString('utf8');
      const out = await this.actions.runDataIngestFbrefPlayersCsv({
        csvText,
        competitionCode,
        seasonTag,
        originalFileName: file.originalname,
      });
      const r = out.result as Record<string, unknown>;
      this.redirectPlayerData(
        res,
        true,
        `FBref CSV 已入库。jobId=${out.jobId}。更新球员 ${String(r?.updatedPlayers ?? '—')} 人；未匹配球队 ${String(r?.skippedNoTeam ?? '—')} 行；未匹配球员 ${String(r?.skippedNoPlayer ?? '—')} 行。详见任务 resultSummary / 下方提示。`,
      );
    } catch (e) {
      this.redirectPlayerData(res, false, actionErrorMessage(e));
    }
  }

  /** 立即执行与 Cron「近窗比分轮询」相同的 FD + API-Football 批量刷新（不依赖 ENABLE_CRON_SYNC）。 */
  @Post('data-ingest/actions/poll-recent-fd-match-status')
  async dataIngestPollRecentFdMatchStatus(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    try {
      const out = await this.footballData.pollRecentMatchStatusNearWindow();
      const fd = out.footballData;
      const af = out.apiFootball;
      this.redirectDataIngest(
        res,
        true,
        `近窗比分/状态已刷新。FD：处理 ${fd.attempted} 场，成功 ${fd.succeeded}，失败 ${fd.failed}。API-Football：处理 ${af.attempted} 场，成功 ${af.succeeded}，失败 ${af.failed}（${af.skipped}）。`,
      );
    } catch (e) {
      this.redirectDataIngest(res, false, actionErrorMessage(e));
    }
  }

  @Post('data-ingest/actions/fd-finished')
  async dataIngestFdFinished(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    let codes = this.parseFdCodesFromBody(body || {});
    if (codes.length === 0) {
      codes = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL'];
    }
    const dateFrom = String(body.dateFrom ?? body['date-from'] ?? '').trim();
    const dateTo = String(body.dateTo ?? body['date-to'] ?? '').trim();
    if (!dateFrom || !dateTo) {
      this.redirectDataIngest(res, false, '请填写 dateFrom 与 dateTo（YYYY-MM-DD）');
      return;
    }
    try {
      const out = await this.actions.runDataIngestFdFinished(codes, dateFrom, dateTo);
      this.redirectDataIngest(
        res,
        true,
        `FD 已完赛回填成功。jobId=${out.jobId}。联赛：${codes.join(',')}。请在本页下方「任务记录」查看 resultSummary。`,
      );
    } catch (e) {
      this.redirectDataIngest(res, false, actionErrorMessage(e));
    }
  }

  @Post('data-ingest/actions/fd-player-squads')
  async dataIngestFdPlayerSquads(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    let codes = this.parseFdCodesFromBody(body || {});
    if (codes.length === 0) {
      codes = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL'];
    }
    const delayBetweenTeamMs = Math.min(
      60_000,
      Math.max(0, Number(body.delayBetweenTeamMs ?? body['delay-team-ms'] ?? 900) || 900),
    );
    const delayBetweenPersonMs = Math.min(
      60_000,
      Math.max(0, Number(body.delayBetweenPersonMs ?? body['delay-person-ms'] ?? 350) || 350),
    );
    const enrichPerson =
      body.enrichPerson === true ||
      body.enrichPerson === 'true' ||
      body.enrichPerson === '1' ||
      body['enrich-person'] === '1';
    const skipTeamMeta =
      body.skipTeamMeta === true ||
      body.skipTeamMeta === 'true' ||
      body.skipTeamMeta === '1' ||
      body['skip-team-meta'] === '1';
    const updateTeamMeta = !skipTeamMeta;
    const skipCoachEnrich =
      body.skipCoachEnrich === true ||
      body.skipCoachEnrich === 'true' ||
      body.skipCoachEnrich === '1' ||
      body['skip-coach-enrich'] === '1';
    const enrichCoach = !skipCoachEnrich;
    const coachMatchDetailSample = Math.min(
      12,
      Math.max(
        0,
        Number(
          body.coachMatchDetailSample ??
            body['coach-match-detail-sample'] ??
            5,
        ) || 0,
      ),
    );
    try {
      const out = await this.actions.runDataIngestFdPlayerSquads({
        codes,
        delayBetweenTeamMs,
        delayBetweenPersonMs,
        enrichPerson,
        enrichCoach,
        coachMatchDetailSample,
        updateTeamMeta,
      });
      this.redirectDataIngest(
        res,
        true,
        `FD 球员 squad 入库完成。jobId=${out.jobId}。联赛：${codes.join(',')}。${
          enrichPerson ? '已开启球员 Person 增强。' : '未开启球员 Person 增强。'
        }${enrichCoach ? ` 教练档案已写入 Team.coachProfile（单场阵型样本=${coachMatchDetailSample}）。` : ' 未拉取教练 Person/比赛（仅 /teams 教练摘要）。'} 详见任务记录。`,
      );
    } catch (e) {
      this.redirectDataIngest(res, false, actionErrorMessage(e));
    }
  }

  @Post('data-ingest/actions/api-football-fixtures')
  async dataIngestApiFootballFixtures(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    if (!this.config.get<string>('apiFootballApiKey')?.trim()) {
      this.redirectDataIngest(
        res,
        false,
        '未检测到 API_FOOTBALL_API_KEY：请在运行环境的 .env 或平台「环境变量」中配置（名称须完全一致），保存后重启 Node 进程，再确认本页顶部 API-Football Key 为绿色已配置。',
      );
      return;
    }
    let codes = this.parseFdCodesFromBody(body || {});
    if (codes.length === 0) {
      codes = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL', 'EL', 'UECL'];
    }
    const season = Math.trunc(
      Number(body.season ?? body['season'] ?? 2024) || 2024,
    );
    const delayBetweenRequestsMs = Math.min(
      10_000,
      Math.max(
        0,
        Number(
          body.delayBetweenRequestsMs ?? body['delay-between-ms'] ?? 1350,
        ) || 1350,
      ),
    );
    const maxPagesPerLeague = Math.min(
      100,
      Math.max(
        1,
        Number(body.maxPagesPerLeague ?? body['max-pages'] ?? 40) || 40,
      ),
    );
    try {
      const out = await this.actions.runDataIngestApiFootballFixtures({
        competitionCodes: codes,
        season,
        delayBetweenRequestsMs,
        maxPagesPerLeague,
      });
      this.redirectDataIngest(
        res,
        true,
        `API-Football 赛程已同步。jobId=${out.jobId}。赛季=${season}；联赛：${codes.join(',')}。详见 resultSummary（免费版注意每日请求与赛季范围，见数据入库页说明）。`,
      );
    } catch (e) {
      this.redirectDataIngest(res, false, actionErrorMessage(e));
    }
  }

  @Post('data-ingest/actions/api-football-squads')
  async dataIngestApiFootballSquads(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    if (!this.config.get<string>('apiFootballApiKey')?.trim()) {
      this.redirectDataIngest(
        res,
        false,
        '未检测到 API_FOOTBALL_API_KEY：请在运行环境的 .env 或平台「环境变量」中配置（名称须完全一致），保存后重启 Node 进程，再确认本页顶部 API-Football Key 为绿色已配置。',
      );
      return;
    }
    let codes = this.parseFdCodesFromBody(body || {});
    if (codes.length === 0) {
      codes = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL', 'EL', 'UECL'];
    }
    const season = Math.trunc(
      Number(body.season ?? body['season'] ?? 2024) || 2024,
    );
    const delayBetweenRequestsMs = Math.min(
      10_000,
      Math.max(
        0,
        Number(
          body.delayBetweenRequestsMs ?? body['delay-between-ms'] ?? 2200,
        ) || 2200,
      ),
    );
    const maxTeamsPerLeague = Math.min(
      50,
      Math.max(
        1,
        Number(body.maxTeamsPerLeague ?? body['max-teams'] ?? 24) || 24,
      ),
    );
    try {
      const out = await this.actions.runDataIngestApiFootballSquads({
        competitionCodes: codes,
        season,
        delayBetweenRequestsMs,
        maxTeamsPerLeague,
      });
      this.redirectDataIngest(
        res,
        true,
        `API-Football 球员名单已同步。jobId=${out.jobId}。赛季=${season}；联赛：${codes.join(',')}。须先跑过 API-Football 赛程。详见 resultSummary。`,
      );
    } catch (e) {
      this.redirectDataIngest(res, false, actionErrorMessage(e));
    }
  }

  @Post('data-ingest/actions/statsbomb-open-data')
  async dataIngestStatsbombOpenData(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    const competitionCode = String(
      body.competitionCode ?? body['competition-code'] ?? '',
    ).trim();
    const sbCompetitionId = Number(
      body.sbCompetitionId ?? body['sb-competition-id'] ?? NaN,
    );
    const sbSeasonId = Number(body.sbSeasonId ?? body['sb-season-id'] ?? NaN);
    const baseUrl = String(body.baseUrl ?? body['base-url'] ?? '').trim();
    const maxMatches = Math.min(
      500,
      Math.max(1, Number(body.maxMatches ?? body['max-matches'] ?? 40) || 40),
    );
    const delayMs = Math.min(
      30_000,
      Math.max(0, Number(body.delayMs ?? body['delay-ms'] ?? 400) || 400),
    );
    const maxEventsStored = Math.min(
      50_000,
      Math.max(
        0,
        Number(body.maxEventsStored ?? body['max-events-stored'] ?? 4000) || 4000,
      ),
    );
    const skipCreateMatch =
      body.skipCreateMatch === true ||
      body.skipCreateMatch === 'true' ||
      body.skipCreateMatch === '1' ||
      body['skip-create-match'] === '1';
    if (!competitionCode || !Number.isFinite(sbCompetitionId) || !Number.isFinite(sbSeasonId)) {
      this.redirectDataIngest(
        res,
        false,
        '请填写 competitionCode、sbCompetitionId、sbSeasonId（见 StatsBomb open-data 路径 data/matches/{cid}/{sid}.json）',
      );
      return;
    }
    try {
      const out = await this.actions.runDataIngestStatsbombOpenData({
        sbCompetitionId: Math.floor(sbCompetitionId),
        sbSeasonId: Math.floor(sbSeasonId),
        competitionCode,
        ...(baseUrl ? { baseUrl } : {}),
        maxMatches,
        delayMs,
        maxEventsStored,
        skipCreateMatch,
      });
      const r = out.result as {
        ok?: boolean;
        factsWritten?: number;
        createdMatches?: number;
        error?: string;
      };
      if (r && r.ok === false) {
        this.redirectDataIngest(
          res,
          false,
          `StatsBomb 拉取失败：${JSON.stringify(r).slice(0, 500)}`,
        );
        return;
      }
      this.redirectDataIngest(
        res,
        true,
        `StatsBomb Open Data 已处理。jobId=${out.jobId}。factsWritten≈${r?.factsWritten ?? '—'}；新建 Match≈${r?.createdMatches ?? 0}。须遵守上游许可与署名要求。`,
      );
    } catch (e) {
      this.redirectDataIngest(res, false, actionErrorMessage(e));
    }
  }

  /** 解析 StatsBomb 批量映射：JSON 数组 或 多行 `11=PD` / `43:CL` */
  private parseStatsbombBatchMappings(body: Record<string, unknown>): {
    sbCompetitionId: number;
    competitionCode: string;
  }[] {
    const jsonRaw = String(body.mappingsJson ?? body['mappings-json'] ?? '').trim();
    if (jsonRaw) {
      let arr: unknown;
      try {
        arr = JSON.parse(jsonRaw) as unknown;
      } catch {
        throw new BadRequestException('mappings-json 不是合法 JSON');
      }
      if (!Array.isArray(arr) || arr.length === 0) {
        throw new BadRequestException('mappings-json 须为非空 JSON 数组，如 [{"sbCompetitionId":11,"competitionCode":"PD"}]');
      }
      return arr.map((row, i) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          throw new BadRequestException(`mappings-json[${i}] 须为对象`);
        }
        const o = row as Record<string, unknown>;
        const id = Number(o.sbCompetitionId ?? o.competition_id);
        const code = String(o.competitionCode ?? o.code ?? '').trim();
        if (!Number.isFinite(id) || id < 1 || !code) {
          throw new BadRequestException(
            `mappings-json[${i}] 须含 sbCompetitionId（或 competition_id）与 competitionCode`,
          );
        }
        return { sbCompetitionId: Math.floor(id), competitionCode: code.toUpperCase() };
      });
    }
    const lines = String(body.mappingsLines ?? body['mappings-lines'] ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    const out: { sbCompetitionId: number; competitionCode: string }[] = [];
    for (const line of lines) {
      const m = /^(\d+)\s*[=:，,]\s*([A-Za-z0-9_-]+)/.exec(line);
      if (!m) {
        throw new BadRequestException(`无法解析映射行：${line.slice(0, 80)}（期望 数字=CODE）`);
      }
      out.push({
        sbCompetitionId: Math.floor(Number(m[1])),
        competitionCode: m[2].toUpperCase(),
      });
    }
    if (!out.length) {
      throw new BadRequestException('请填写 mappings-json 或 mappings-lines（每行 competition_id=本地code）');
    }
    return out;
  }

  @Post('data-ingest/actions/statsbomb-batch')
  async dataIngestStatsbombBatch(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    const presetRaw = String(body.preset ?? body['preset-select'] ?? '').trim();
    const preset: StatsbombAutoMapPreset | undefined =
      presetRaw === 'BIG5_EURO' || presetRaw === 'ALL_MAPPED' ? presetRaw : undefined;

    let mappings: { sbCompetitionId: number; competitionCode: string }[] | undefined;
    try {
      if (!preset) {
        mappings = this.parseStatsbombBatchMappings(body);
      }
    } catch (e) {
      this.redirectDataIngest(
        res,
        false,
        e instanceof BadRequestException ? e.message : actionErrorMessage(e),
      );
      return;
    }
    const maxPairs = Math.min(
      200,
      Math.max(1, Number(body.maxPairs ?? body['max-pairs'] ?? 15) || 15),
    );
    const maxMatchesPerPair = Math.min(
      500,
      Math.max(1, Number(body.maxMatchesPerPair ?? body['max-matches-pair'] ?? 40) || 40),
    );
    const delayMs = Math.min(
      30_000,
      Math.max(0, Number(body.delayMs ?? body['delay-ms'] ?? 400) || 400),
    );
    const delayBetweenPairsMs = Math.min(
      120_000,
      Math.max(0, Number(body.delayBetweenPairsMs ?? body['delay-between-pairs-ms'] ?? 800) || 800),
    );
    const maxEventsStored = Math.min(
      50_000,
      Math.max(
        0,
        Number(body.maxEventsStored ?? body['max-events-stored'] ?? 4000) || 4000,
      ),
    );
    const dryRun =
      body.dryRun === true ||
      body.dryRun === 'true' ||
      body.dryRun === '1' ||
      body['dry-run'] === '1';
    const includeMatchCountsInDryRun =
      body.includeMatchCountsInDryRun === true ||
      body.includeMatchCountsInDryRun === '1' ||
      body['dry-run-probe'] === '1';
    const skipCreateMatch =
      body.skipCreateMatch === true ||
      body.skipCreateMatch === '1' ||
      body['skip-create-match'] === '1';
    const baseUrl = String(body.baseUrl ?? body['base-url'] ?? '').trim();
    try {
      const out = await this.actions.runDataIngestStatsbombBatch({
        preset,
        mappings,
        maxPairs,
        maxMatchesPerPair,
        delayMs,
        delayBetweenPairsMs,
        maxEventsStored,
        skipCreateMatch,
        dryRun,
        includeMatchCountsInDryRun,
        ...(baseUrl ? { baseUrl } : {}),
      });
      const r = out.result as {
        dryRun?: boolean;
        plannedPairs?: number;
        totals?: { pairOk?: number; pairFail?: number; factsWritten?: number };
        warning?: string;
        skippedCatalogRowsNoLocalCompetition?: number;
      };
      const mode = r?.dryRun ? '审计(dryRun)' : '批量入库';
      const pairs = r?.plannedPairs ?? '—';
      const ok = r?.totals?.pairOk;
      const fail = r?.totals?.pairFail;
      const fw = r?.totals?.factsWritten;
      const skipLoc = r?.skippedCatalogRowsNoLocalCompetition;
      const presetLabel = preset ? `preset=${preset}` : '手动映射';
      this.redirectDataIngest(
        res,
        true,
        `StatsBomb ${mode} 完成（${presetLabel}）。jobId=${out.jobId}。计划/处理季数≈${pairs}；pairOk≈${ok ?? '—'} pairFail≈${fail ?? '—'} factsWritten≈${fw ?? '—'}；无本地赛事跳过目录行≈${skipLoc ?? 0}。${r?.warning ?? ''}`.trim(),
      );
    } catch (e) {
      this.redirectDataIngest(res, false, actionErrorMessage(e));
    }
  }

  @Post('data-ingest/actions/openfootball')
  async dataIngestOpenFootball(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    const leagueKey = String(body.leagueKey ?? body['league-key'] ?? '').trim();
    const competitionCode = String(
      body.competitionCode ?? body['competition-code'] ?? '',
    ).trim();
    const seasonFolder = String(body.seasonFolder ?? body['season-folder'] ?? '')
      .trim()
      .replace(/\s+/g, '');
    const url = String(body.url ?? '').trim();
    if (!leagueKey || !competitionCode) {
      this.redirectDataIngest(res, false, '请填写 leagueKey 与 competitionCode');
      return;
    }
    try {
      const out = await this.actions.runDataIngestOpenFootball({
        leagueKey,
        competitionCode,
        ...(seasonFolder ? { seasonFolder } : {}),
        ...(url ? { url } : {}),
      });
      const r = out.result as { ok?: boolean; imported?: number; error?: string };
      if (r && r.ok === false) {
        this.redirectDataIngest(
          res,
          false,
          `OpenFootball 校验失败：${JSON.stringify(r).slice(0, 500)}`,
        );
        return;
      }
      this.redirectDataIngest(
        res,
        true,
        `OpenFootball 导入完成。jobId=${out.jobId}。imported≈${r?.imported ?? '—'}。`,
      );
    } catch (e) {
      this.redirectDataIngest(res, false, actionErrorMessage(e));
    }
  }

  @Post('data-ingest/actions/structure-preview')
  async dataIngestStructurePreview(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const rawText = String(body.rawText ?? body['raw-text'] ?? '').trim();
    const hint = String(body.hint ?? '').trim();
    const maxAttempts = Number(body.maxAttempts ?? 2);
    const [finishedMatchCount, matchFactsCount, ingestJobCount, playerCount] =
      await Promise.all([
        this.prisma.match.count({ where: { status: 'FINISHED' } }),
        this.prisma.matchFacts.count(),
        this.prisma.ingestJobRun.count(),
        this.prisma.player.count(),
      ]);
    const recentJobs = await this.actions.listDataIngestJobs(25);
    if (!rawText) {
      return res.render('admin/data-ingest', {
        title: '数据入库 · API-Football / FD / OpenFootball / StatsBomb',
        flashErr: '原始文本不能为空',
        flashMsg: undefined,
        stats: {
          finishedMatchCount,
          matchFactsCount,
          ingestJobCount,
          playerCount,
        },
        recentJobs,
        structurePreviewJson: '',
        envHints: this.dataIngestEnvHints(),
        ...this.pathPrefixLocals(),
      });
    }
    try {
      const parsed = await this.actions.runDataIngestStructurePreview(
        rawText,
        hint || undefined,
        Number.isFinite(maxAttempts) ? maxAttempts : 2,
      );
      return res.render('admin/data-ingest', {
        title: '数据入库 · API-Football / FD / OpenFootball / StatsBomb',
        flashMsg: 'DeepSeek 结构化成功（本操作不落库，仅预览 JSON）',
        flashErr: undefined,
        stats: {
          finishedMatchCount,
          matchFactsCount,
          ingestJobCount,
          playerCount,
        },
        recentJobs,
        structurePreviewJson: JSON.stringify(parsed, null, 2),
        envHints: this.dataIngestEnvHints(),
        ...this.pathPrefixLocals(),
      });
    } catch (e) {
      return res.render('admin/data-ingest', {
        title: '数据入库 · API-Football / FD / OpenFootball / StatsBomb',
        flashErr: actionErrorMessage(e),
        flashMsg: undefined,
        stats: {
          finishedMatchCount,
          matchFactsCount,
          ingestJobCount,
          playerCount,
        },
        recentJobs,
        structurePreviewJson: '',
        envHints: this.dataIngestEnvHints(),
        ...this.pathPrefixLocals(),
      });
    }
  }

  @Get('data-report')
  async dataReportPage(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const overview = await this.statsReport.getMatchDataOverview();
    return res.render('admin/data-report', {
      title: '数据报表 · 比赛与球员',
      overview,
      overviewJson: JSON.stringify(overview, null, 2),
      ...this.pathPrefixLocals(),
    });
  }

  @Get('worldcup2026-teams')
  async worldcup2026TeamsShortcut(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const comp = await this.resolveSeedWorldCupCompetition();
    if (!comp) {
      return res
        .status(404)
        .send('未找到世界杯赛事实例（请先执行 prisma db seed）。');
    }
    return this.renderWorldCup2026Teams(res, comp);
  }

  @Get('competitions/:id/worldcup2026-teams')
  async worldcup2026TeamsForCompetition(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const comp = await this.prisma.competition.findUnique({
      where: { id },
      include: { tournament: true, season: true },
    });
    if (!comp) return res.status(404).send('赛事实例不存在');
    return this.renderWorldCup2026Teams(res, comp);
  }

  @Get('worldcup2026-team-detail/:teamId')
  async wc2026TeamDetailEdit(
    @Req() req: Request,
    @Param('teamId') teamId: string,
    @Query('token') token: string | undefined,
    @Query('saved') saved: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, externalId: { startsWith: 'wc26-' } },
    });
    if (!team) return res.status(404).send('未找到 wc26- 国家队');
    const p =
      team.wc2026Profile &&
      typeof team.wc2026Profile === 'object' &&
      !Array.isArray(team.wc2026Profile)
        ? (team.wc2026Profile as Record<string, unknown>)
        : {};
    const keyPlayersJson = JSON.stringify(
      (Array.isArray(p.keyPlayers) ? p.keyPlayers : []) as unknown[],
      null,
      2,
    );
    const tacticalPitchJson = JSON.stringify(
      p.tacticalPitch &&
        typeof p.tacticalPitch === 'object' &&
        !Array.isArray(p.tacticalPitch)
        ? p.tacticalPitch
        : { kind: 'structured', zones: [], diagramUrl: null },
      null,
      2,
    );
    const aiPowerScoreJson = JSON.stringify(
      p.aiPowerScore &&
        typeof p.aiPowerScore === 'object' &&
        !Array.isArray(p.aiPowerScore)
        ? p.aiPowerScore
        : {},
      null,
      2,
    );
    const tacticalTagsStr = Array.isArray(p.tacticalTags)
      ? (p.tacticalTags as string[]).join(', ')
      : '';
    return res.render('admin/worldcup2026-team-detail', {
      title: `世界杯球队资料 · ${team.nameCn}`,
      team,
      profile: p,
      keyPlayersJson,
      tacticalPitchJson,
      aiPowerScoreJson,
      tacticalTagsStr,
      flashOk: saved === '1',
      ...this.pathPrefixLocals(),
    });
  }

  @Post('worldcup2026-team-detail/:teamId')
  async wc2026TeamDetailSave(
    @Req() req: Request,
    @Param('teamId') teamId: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const body = req.body as Record<string, unknown>;
    try {
      const dto = this.parseWc2026TeamDetailDtoFromForm(body);
      await this.admin.patchWc2026TeamDetail(teamId, dto);
    } catch (e) {
      return res.status(400).send(actionErrorMessage(e));
    }
    const av = this.adminViewPathPrefix();
    return res.redirect(
      302,
      `${av}/worldcup2026-team-detail/${teamId}?saved=1`,
    );
  }

  /** 杯赛维度：列出赛程中出现过的球队（公开来源 / ESPN roster 核对用）。 */
  @Get('competitions/:id/tools')
  async competitionTools(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Query('seasonId') seasonId: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const comp = await this.prisma.competition.findUnique({
      where: { id },
      include: { tournament: true, season: true },
    });
    if (!comp) return res.status(404).send('赛事实例不存在');
    const tool = await this.actions.listTeamsForCompetitionTool(id, seasonId);
    return res.render('admin/competition-tools', {
      title: `杯赛工具 · ${comp.nameCn}`,
      comp,
      tool,
      seasonId: seasonId || '',
      flashMsg: typeof req.query.msg === 'string' ? req.query.msg : '',
      flashErr: typeof req.query.err === 'string' ? req.query.err : '',
      ...this.pathPrefixLocals(),
    });
  }

  /**
   * 世界杯（FIFA_WC / code=WC）：API-Football 赛程 + 全队列阵容 + 单场线审/教练/场地一键入库。
   */
  @Post('competitions/:id/actions/worldcup-api-football-bundle')
  async postWorldCupApiFootballBundle(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    if (!this.config.get<string>('apiFootballApiKey')?.trim()) {
      this.redirectCompetitionTools(
        res,
        id,
        false,
        '未配置 API_FOOTBALL_API_KEY，无法拉取 api-sports 数据。',
      );
      return;
    }
    const comp = await this.prisma.competition.findUnique({
      where: { id },
      include: { tournament: true },
    });
    if (!comp) {
      return res.status(404).send('赛事实例不存在');
    }
    const isWc =
      comp.code === 'WC' || comp.tournament?.code === 'FIFA_WC';
    if (!isWc) {
      this.redirectCompetitionTools(res, id, false, '仅支持世界杯赛事实例（code=WC 或所属 FIFA_WC）。');
      return;
    }
    const season = Math.trunc(Number(body.season ?? body['season'] ?? 2026) || 2026);
    const delayBetweenRequestsMs = Math.min(
      15_000,
      Math.max(
        0,
        Number(body.delayBetweenRequestsMs ?? body['delay-between-ms'] ?? 1500) || 1500,
      ),
    );
    const maxMatchesForEnrich = Math.min(
      128,
      Math.max(
        1,
        Number(body.maxMatchesForEnrich ?? body['max-matches-enrich'] ?? 56) || 56,
      ),
    );
    const skipFixtures =
      body.skipFixtures === true ||
      body.skipFixtures === 'true' ||
      body.skipFixtures === '1' ||
      body['skip-fixtures'] === '1';
    const skipSquads =
      body.skipSquads === true ||
      body.skipSquads === 'true' ||
      body.skipSquads === '1' ||
      body['skip-squads'] === '1';
    const skipEnrich =
      body.skipEnrich === true ||
      body.skipEnrich === 'true' ||
      body.skipEnrich === '1' ||
      body['skip-enrich'] === '1';
    const skipWcProfiles =
      body.skipWcProfiles === true ||
      body.skipWcProfiles === 'true' ||
      body.skipWcProfiles === '1' ||
      body['skip-wc-profiles'] === '1';
    const maxTeamsForWcProfiles = Math.min(
      64,
      Math.max(
        1,
        Number(body.maxTeamsForWcProfiles ?? body['max-teams-wc-profiles'] ?? 56) || 56,
      ),
    );
    try {
      const out = await this.actions.runWorldCupApiFootballFullBundle({
        season,
        skipFixtures,
        skipSquads,
        skipWcProfiles,
        skipEnrich,
        maxMatchesForEnrich,
        maxTeamsForWcProfiles,
        delayBetweenRequestsMs,
      });
      const en = out.enrichment as { attempted?: number; enriched?: number; failed?: number } | undefined;
      const wp = out.wcProfiles as
        | { updated?: number; failed?: number; skippedNoLocalTeam?: number }
        | undefined;
      this.redirectCompetitionTools(
        res,
        id,
        true,
        `世界杯 API-Football 入库完成。season=${season}。wc2026Profile: updated=${wp?.updated ?? '—'} fail=${wp?.failed ?? '—'} skip无本地队=${wp?.skippedNoLocalTeam ?? '—'}。enrich: attempted=${en?.attempted ?? '—'} ok=${en?.enriched ?? '—'} fail=${en?.failed ?? '—'}。`,
      );
    } catch (e) {
      this.redirectCompetitionTools(res, id, false, actionErrorMessage(e));
    }
  }

  @Get('seasons')
  async seasons(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const rows = await this.admin.listSeasons();
    return res.render('admin/table', {
      title: '赛季（Season）',
      columns: ['code', 'name', 'year', 'isCurrent'],
      rows,
      ...this.pathPrefixLocals(),
    });
  }

  @Get('provider-mappings')
  async mappings(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const rows = await this.admin.listProviderMappings();
    return res.render('admin/table', {
      title: '数据源映射',
      columns: ['provider', 'providerCompetitionCode', 'tournamentId', 'competitionId'],
      rows: rows.map((r) => ({
        provider: r.provider,
        providerCompetitionCode: r.providerCompetitionCode,
        tournamentId: r.tournamentId,
        competitionId: r.competitionId,
      })),
      ...this.pathPrefixLocals(),
    });
  }

  @Get('matches')
  async matches(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Query('tournamentId') tournamentId: string | undefined,
    @Query('seasonId') seasonId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('sort') sort: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const orderDir = sort === 'desc' ? 'desc' : 'asc';
    const rows = await this.prisma.match.findMany({
      where: {
        tournamentId: tournamentId || undefined,
        seasonId: seasonId || undefined,
        status: status ? (status as never) : undefined,
      },
      include: { homeTeam: true, awayTeam: true, competition: true },
      orderBy: { kickoffTime: orderDir },
      take: 250,
    });
    return res.render('admin/matches', {
      title: '比赛列表',
      tournamentId: tournamentId || '',
      seasonId: seasonId || '',
      status: status || '',
      sort: sort === 'desc' ? 'desc' : 'asc',
      rows,
      ...this.pathPrefixLocals(),
    });
  }

  @Get('matches/:id/poster-prompt-preview')
  async posterPromptPreview(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Query('customElements') customElements: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    try {
      const out = await this.actions.previewSocialPosterPrompt(
        id,
        customElements || '',
      );
      return res.render('admin/poster-prompt-preview', {
        title: '海报 Prompt 预览',
        matchId: id,
        prompt: out.prompt,
        ...this.pathPrefixLocals(),
      });
    } catch (e) {
      return res
        .status(400)
        .send(
          `<!DOCTYPE html><html><body style="background:#0f172a;color:#f87171;font-family:sans-serif;padding:1.5rem"><pre>${actionErrorMessage(e)}</pre><p><a style="color:#38bdf8" href="javascript:history.back()">返回</a></p></body></html>`,
        );
    }
  }

  @Get('matches/:id')
  async matchDetail(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Query('msg') msg: string | undefined,
    @Query('err') err: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const m = await this.admin.getMatch(id);
    if (!m) {
      return res.status(404).send('比赛不存在');
    }
    const [orderCount, unlockCount] = await Promise.all([
      this.prisma.order.count({ where: { matchId: id } }),
      this.prisma.paymentUnlock.count({ where: { matchId: id } }),
    ]);
    const envHints = {
      enableCronSync: this.config.get<boolean>('enableCronSync') === true,
      enablePublicSourceFetch:
        this.config.get<boolean>('enablePublicSourceFetch') === true,
      enableMockDeepseek: this.config.get<boolean>('enableMockDeepseek') === true,
      hasApiFootballKey: !!this.config.get<string>('apiFootballApiKey')?.trim(),
      hasFootballDataKey: !!this.config.get<string>('footballDataApiKey'),
      hasDeepseekKey: !!this.config.get<string>('deepseekApiKey'),
      hasQweather: !!(
        this.config.get<string>('qweatherApiKey') ||
        this.config.get<string>('qweatherCredentialId')
      ),
      posterImageMock: this.config.get<boolean>('enablePosterImageMock') === true,
      posterDevBypass: this.config.get<boolean>('enablePosterDevBypass') === true,
      hasGptImage2Key: !!this.config.get<string>('gptImage2ApiKey'),
      socialPosterPriceCents:
        this.config.get<number>('socialPosterPriceCents') ?? 390,
    };
    return res.render('admin/match-detail', {
      title: `比赛 · ${m.homeTeam?.nameCn} vs ${m.awayTeam?.nameCn}`,
      m,
      orderCount,
      unlockCount,
      flashMsg: msg,
      flashErr: err,
      envHints,
      ...this.pathPrefixLocals(),
    });
  }

  private async runMatchAction(
    req: Request,
    res: Response,
    token: string | undefined,
    matchId: string,
    run: () => Promise<unknown>,
    okMsg: string | ((result: unknown) => string),
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    try {
      const result = await run();
      const msg =
        typeof okMsg === 'function'
          ? (okMsg as (r: unknown) => string)(result)
          : okMsg;
      this.redirectMatch(res, matchId, true, msg.slice(0, 450));
    } catch (e) {
      this.redirectMatch(res, matchId, false, actionErrorMessage(e));
    }
  }

  private async runMatchActionWithAdmin(
    req: Request,
    res: Response,
    token: string | undefined,
    matchId: string,
    run: (admin: User) => Promise<unknown>,
    okMsg: string | ((result: unknown) => string),
  ) {
    const admin = await this.requireAdmin(req, token, res);
    if (!admin) return;
    try {
      const result = await run(admin);
      const msg =
        typeof okMsg === 'function'
          ? (okMsg as (r: unknown) => string)(result)
          : okMsg;
      this.redirectMatch(res, matchId, true, msg.slice(0, 450));
    } catch (e) {
      this.redirectMatch(res, matchId, false, actionErrorMessage(e));
    }
  }

  @Post('matches/:id/actions/fetch-public-sources')
  postFetchSources(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchAction(
      req,
      res,
      token,
      id,
      () => this.actions.fetchPublicSources(id),
      (result) => {
        const r = result as {
          sources?: Array<{ type?: string; name?: string }>;
          skipped?: boolean;
        };
        if (r?.skipped) return '公开来源：已跳过（阶段或窗口）';
        const parts = (r?.sources || []).map((s) => s.name || s.type).join('、');
        if (!parts)
          return '公开来源：未写入新行（可能 5 分钟内同来源已抓过，请用「强制」）';
        return `公开来源已写入：${parts}`;
      },
    );
  }

  @Post('matches/:id/actions/fetch-public-sources-force')
  postFetchSourcesForce(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchAction(
      req,
      res,
      token,
      id,
      () => this.actions.fetchPublicSources(id, { force: true }),
      (result) => {
        const r = result as { sources?: Array<{ type?: string; name?: string }> };
        const parts = (r?.sources || []).map((s) => s.name || s.type).join('、');
        return parts
          ? `公开来源（强制）已写入：${parts}`
          : '公开来源（强制）已完成（仍可能无外部数据）';
      },
    );
  }

  @Post('matches/:id/actions/sync-weather')
  postSyncWeather(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchAction(req, res, token, id, () =>
      this.actions.syncWeather(id),
    '天气同步已完成');
  }

  @Post('matches/:id/actions/sync-football-matches')
  postSyncFootballMatches(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchAction(req, res, token, id, () =>
      this.actions.syncFootballMatchesForMatch(id),
    '赛程同步已触发（按本比赛所属赛事实例 code）');
  }

  @Post('matches/:id/actions/sync-football-standings')
  postSyncStandings(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchAction(req, res, token, id, () =>
      this.actions.syncFootballStandingsForMatch(id),
    '积分榜同步已触发');
  }

  @Post('matches/:id/actions/sync-fd-match-intel')
  postSyncFdMatchIntel(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchAction(
      req,
      res,
      token,
      id,
      () => this.actions.syncFdMatchIntel(id),
      (result: unknown) => {
        const r = result as { warnings?: string[] };
        const n = r.warnings?.length ?? 0;
        return `FD 单场详情与情报字段已同步${n ? `（${n} 条提示见服务端日志/响应）` : ''}`;
      },
    );
  }

  @Post('matches/:id/actions/run-intel-pipeline')
  postRunIntelPipeline(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchAction(
      req,
      res,
      token,
      id,
      () => this.actions.runIntelFullPipeline(id),
      (result: unknown) => {
        const r = result as { status: string; summary: string; deepseekReal?: boolean };
        const ds = r.deepseekReal ? 'DeepSeek=真实' : 'DeepSeek=mock/无Key';
        return `Phase C 管线 ${r.status}（${ds}）${r.summary}`.slice(0, 450);
      },
    );
  }

  @Post('matches/:id/actions/generate-prediction')
  postGenPrediction(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchAction(req, res, token, id, () =>
      this.actions.generatePrediction(id),
    '预测模型已生成/更新');
  }

  @Post('matches/:id/actions/generate-player-intelligence')
  postGenPlayerIntel(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchAction(req, res, token, id, () =>
      this.actions.generatePlayerIntelligence(id),
    '球员画像已生成/更新');
  }

  @Post('matches/:id/actions/generate-tactics')
  postGenTactics(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchAction(req, res, token, id, () =>
      this.actions.generateTactics(id),
    '战术沙盘已生成/更新');
  }

  @Post('matches/:id/actions/generate-fantasy')
  postGenFantasy(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchAction(req, res, token, id, () =>
      this.actions.generateFantasy(id),
    'Fantasy 建议已生成/更新');
  }

  @Post('matches/:id/actions/generate-head-to-head')
  postGenH2h(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchAction(req, res, token, id, () =>
      this.actions.generateHeadToHead(id),
    '历史交锋已生成/更新');
  }

  @Post('matches/:id/actions/generate-social-guide')
  postGenSocial(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchAction(req, res, token, id, () =>
      this.actions.generateSocialGuide(id),
    '社交媒体指南已生成/更新');
  }

  @Post('matches/:id/actions/social-poster-generate')
  postSocialPosterGenerate(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Body('customElements') customElements: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchActionWithAdmin(
      req,
      res,
      token,
      id,
      (admin) =>
        this.actions.generateSocialPoster(
          id,
          admin.id,
          (customElements || '').trim(),
        ),
      (result) => {
        const r = result as {
          posterImageUrl?: string | null;
          billing?: string;
        };
        const u = r.posterImageUrl ? String(r.posterImageUrl) : '';
        const tail = u
          ? u.startsWith('data:')
            ? `（内联图，${u.length} 字符；单场页内预览）`
            : ` 外链前段: ${u.slice(0, 96)}`
          : '';
        return `社交海报已生成｜计费: ${r.billing || '—'}${tail}`;
      },
    );
  }

  @Post('matches/:id/actions/generate-report')
  postGenReport(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.runMatchAction(req, res, token, id, () =>
      this.actions.generateReport(id),
    'AI 报告草稿已生成');
  }

  @Post('matches/:id/actions/publish-report')
  async postPublishReport(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    try {
      await this.actions.publishReport(id, {
        id: user.id,
        openid: user.openid,
        role: user.role,
      });
      this.redirectMatch(res, id, true, '报告已发布');
    } catch (e) {
      this.redirectMatch(res, id, false, actionErrorMessage(e));
    }
  }

  @Post('matches/:id/actions/set-featured')
  async postSetFeatured(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Body('featured') featured: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.requireAdmin(req, token, res);
    if (!user) return;
    const on = featured === '1' || featured === 'true';
    try {
      await this.actions.setFeatured(id, on);
      this.redirectMatch(
        res,
        id,
        true,
        on ? '已设为焦点战' : '已取消焦点战',
      );
    } catch (e) {
      this.redirectMatch(res, id, false, actionErrorMessage(e));
    }
  }

  @Get('orders')
  async orders(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const rows = await this.admin.listOrders();
    return res.render('admin/table', {
      title: '订单',
      columns: ['orderNo', 'product', 'status', 'amount', 'posterConsumed', 'userId', 'matchId'],
      rows: rows.map((o) => ({
        orderNo: o.orderNo,
        product: o.product,
        status: o.status,
        amount: o.amount,
        posterConsumed: o.posterConsumed ? '是' : '',
        userId: o.userId,
        matchId: o.matchId,
      })),
      ...this.pathPrefixLocals(),
    });
  }

  @Get('unlocks')
  async unlocks(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const rows = await this.admin.listUnlocks();
    return res.render('admin/table', {
      title: '解锁记录',
      columns: ['userId', 'matchId', 'status', 'amount', 'transactionId'],
      rows,
      ...this.pathPrefixLocals(),
    });
  }

  @Get('sources')
  async sources(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Query('matchId') matchId: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const rows = await this.admin.listSources(matchId);
    return res.render('admin/sources', {
      title: matchId ? `来源记录 · 比赛 ${matchId}` : '来源记录（SourceRecord）',
      matchId: matchId || '',
      rows,
      ...this.pathPrefixLocals(),
    });
  }

  @Get('api-logs')
  async apiLogs(
    @Req() req: Request,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const user = await this.auth.resolveAdmin(req, token);
    if (!user) return res.redirect(302, `${this.adminViewPathPrefix()}/login`);
    const rows = await this.admin.listApiLogs();
    return res.render('admin/table', {
      title: 'ApiLog',
      columns: ['createdAt', 'provider', 'endpoint', 'success', 'statusCode', 'message'],
      rows: rows.map((l) => ({
        createdAt: l.createdAt,
        provider: l.provider,
        endpoint: l.endpoint,
        success: l.success,
        statusCode: l.statusCode,
        message: (l.message || '').slice(0, 120),
      })),
      ...this.pathPrefixLocals(),
    });
  }

  private async resolveSeedWorldCupCompetition() {
    let comp = await this.prisma.competition.findUnique({
      where: { id: 'seed-comp-wc' },
      include: { tournament: true, season: true },
    });
    if (!comp) {
      comp = await this.prisma.competition.findFirst({
        where: {
          code: 'WC',
          tournament: { is: { code: 'FIFA_WC' } },
        },
        include: { tournament: true, season: true },
        orderBy: { createdAt: 'asc' },
      });
    }
    return comp;
  }

  private async renderWorldCup2026Teams(
    res: Response,
    comp: {
      id: string;
      nameCn: string;
      nameEn: string | null;
      code: string | null;
      season: { code: string } | null;
      tournament: { code: string } | null;
    },
  ) {
    let rows: Awaited<
      ReturnType<CompetitionsService['listWorldCup2026Teams']>
    >;
    try {
      rows = await this.competitionsSvc.listWorldCup2026Teams(comp.id, true);
    } catch (e) {
      return res.status(400).send(actionErrorMessage(e));
    }
    return res.render('admin/worldcup2026-teams', {
      title: `世界杯2026 · 48强 · ${comp.nameCn}`,
      comp,
      rows,
      restJsonPath: `/competitions/${comp.id}/worldcup2026-teams`,
      slimJsonPath: `/competitions/${comp.id}/worldcup2026-teams?slim=1`,
      ...this.pathPrefixLocals(),
    });
  }
}
