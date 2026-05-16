import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, {
  type AxiosInstance,
  type AxiosResponse,
  isAxiosError,
} from 'axios';
import { PrismaService } from '../prisma/prisma.service';

/** API-Sports 常在 HTTP 200 下返回 errors / results，需单独检查 */
function summarizeApiSportsErrors(body: Record<string, unknown>): {
  errorsText: string;
  results?: number;
} {
  const results = typeof body.results === 'number' ? body.results : undefined;
  const err = body.errors;
  if (err == null) return { errorsText: '', results };
  let errorsText = '';
  try {
    errorsText = typeof err === 'string' ? err : JSON.stringify(err);
  } catch {
    errorsText = String(err);
  }
  return { errorsText: errorsText.slice(0, 800), results };
}

/** 只读代理允许转发的上游 path（不含 query） */
const FOOTBALL_API_PASS_THROUGH_PATHS = new Set([
  '/fixtures',
  '/fixtures/lineups',
  '/fixtures/statistics',
  '/fixtures/events',
  '/fixtures/headtohead',
  '/players',
  '/players/profiles',
  '/players/squads',
  '/players/topscorers',
  '/players/seasons',
  '/teams',
  '/teams/statistics',
  '/injuries',
  '/predictions',
  '/odds',
  '/standings',
]);

@Injectable()
export class ApiFootballService {
  private readonly logger = new Logger(ApiFootballService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  client(): AxiosInstance {
    const key = this.config.get<string>('apiFootballApiKey')?.trim();
    if (!key) {
      throw new BadRequestException(
        '未配置 API-Football 密钥：请在运行环境中设置环境变量 API_FOOTBALL_API_KEY（与 api-sports 控制台一致，勿加空格或错误前缀），保存后重启本服务进程。Docker / Sealos 请在平台「环境变量」里配置，勿只改本地未挂载的 .env。',
      );
    }
    const baseURL =
      this.config.get<string>('apiFootballBaseUrl') ||
      'https://v3.football.api-sports.io';
    return axios.create({
      baseURL,
      timeout: 25_000,
      headers: { 'x-apisports-key': key },
    });
  }

  /** 遇 429（每分钟 / 突发限速）时退避重试，降低名单同步整任务失败概率 */
  private async getWith429Retry<T = unknown>(
    http: AxiosInstance,
    path: string,
    config?: { params?: Record<string, string | number | undefined> },
  ): Promise<AxiosResponse<T>> {
    const maxAttempts = 6;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await http.get<T>(path, config);
      } catch (e) {
        lastErr = e;
        if (!isAxiosError(e) || e.response?.status !== 429) throw e;
        if (attempt >= maxAttempts) throw e;
        const h = e.response.headers ?? {};
        const raRaw = h['retry-after'] ?? h['Retry-After'];
        let waitMs = Math.min(60_000, 3000 * 2 ** (attempt - 1));
        if (raRaw != null) {
          const sec = parseInt(String(raRaw).trim(), 10);
          if (!Number.isNaN(sec) && sec > 0) {
            waitMs = Math.max(waitMs, sec * 1000);
          }
        }
        this.logger.warn(
          `GET ${path} 收到 HTTP 429，${Math.round(waitMs / 1000)}s 后第 ${attempt + 1}/${maxAttempts} 次重试`,
        );
        await this.sleep(waitMs);
      }
    }
    throw lastErr;
  }

  async log(
    endpoint: string,
    method: string,
    statusCode: number | null,
    success: boolean,
    message?: string,
  ) {
    await this.prisma.apiLog.create({
      data: {
        provider: 'api-football',
        endpoint,
        method,
        statusCode: statusCode ?? undefined,
        success,
        message,
      },
    });
  }

  /** GET /fixtures 单页 */
  async getFixturesPage(params: {
    league: number;
    season: number;
    page?: number;
  }): Promise<{
    status: number;
    raw: unknown;
    items: unknown[];
    paging: { current: number; total: number };
    errors?: unknown;
    results?: number;
    errorsText?: string;
  }> {
    const http = this.client();
    const { data, status } = await this.getWith429Retry(http, '/fixtures', {
      params: {
        league: params.league,
        season: params.season,
        page: params.page ?? 1,
      },
    });
    const body = data as Record<string, unknown>;
    const response = Array.isArray(body.response) ? body.response : [];
    const meta = summarizeApiSportsErrors(body);
    await this.log(
      '/fixtures',
      'GET',
      status,
      !meta.errorsText,
      `league=${params.league} season=${params.season} page=${params.page ?? 1} rows=${response.length}${
        meta.results != null ? ` results=${meta.results}` : ''
      }${meta.errorsText ? ` errors=${meta.errorsText}` : ''}`,
    );
    const paging =
      body.paging && typeof body.paging === 'object'
        ? (body.paging as { current?: number; total?: number })
        : { current: 1, total: 1 };
    return {
      status,
      raw: body,
      items: response,
      paging: {
        current: paging.current ?? 1,
        total: paging.total ?? 1,
      },
      errors: body.errors,
      results: meta.results,
      errorsText: meta.errorsText || undefined,
    };
  }

  /** GET /players 单页（阵容/球员列表） */
  async getPlayersPage(params: {
    team: number;
    season: number;
    page?: number;
  }): Promise<{
    status: number;
    items: unknown[];
    paging: { current: number; total: number };
  }> {
    const http = this.client();
    let data: unknown;
    let status: number;
    try {
      const res = await this.getWith429Retry(http, '/players', {
        params: {
          team: params.team,
          season: params.season,
          page: params.page ?? 1,
        },
      });
      data = res.data;
      status = res.status;
    } catch (e) {
      const statusCode = isAxiosError(e) ? e.response?.status ?? null : null;
      const msg = e instanceof Error ? e.message : String(e);
      await this.log(
        '/players',
        'GET',
        statusCode,
        false,
        `team=${params.team} season=${params.season} page=${params.page ?? 1} ${msg}`,
      );
      throw e;
    }
    await this.log(
      '/players',
      'GET',
      status,
      true,
      `team=${params.team} season=${params.season} page=${params.page ?? 1}`,
    );
    const body = data as Record<string, unknown>;
    const response = Array.isArray(body.response) ? body.response : [];
    const paging =
      body.paging && typeof body.paging === 'object'
        ? (body.paging as { current?: number; total?: number })
        : { current: 1, total: 1 };
    return {
      status,
      items: response,
      paging: {
        current: paging.current ?? 1,
        total: paging.total ?? 1,
      },
    };
  }

  /** GET /fixtures?id= — 单场（与列表项结构相同） */
  async getFixtureById(fixtureId: number): Promise<{
    status: number;
    item: unknown | null;
    raw: unknown;
  }> {
    const http = this.client();
    try {
      const { data, status } = await this.getWith429Retry(http, '/fixtures', {
        params: { id: fixtureId },
      });
      const body = data as Record<string, unknown>;
      const response = Array.isArray(body.response) ? body.response : [];
      const first = response[0] ?? null;
      await this.log(
        '/fixtures',
        'GET',
        status,
        true,
        `id=${fixtureId}`,
      );
      return { status, item: first, raw: body };
    } catch (e) {
      const statusCode = isAxiosError(e) ? e.response?.status ?? null : null;
      const msg = e instanceof Error ? e.message : String(e);
      await this.log(
        '/fixtures',
        'GET',
        statusCode,
        false,
        `id=${fixtureId} ${msg}`,
      );
      throw e;
    }
  }

  /** GET /fixtures/lineups?fixture= — 首发、替补、阵型、主教练 */
  async getFixtureLineups(fixtureId: number): Promise<{
    status: number;
    response: unknown[];
    raw: Record<string, unknown>;
  }> {
    const http = this.client();
    try {
      const { data, status } = await this.getWith429Retry<Record<string, unknown>>(
        http,
        '/fixtures/lineups',
        { params: { fixture: fixtureId } },
      );
      const body = data ?? {};
      const arr = Array.isArray(body.response) ? body.response : [];
      const meta = summarizeApiSportsErrors(body);
      await this.log(
        '/fixtures/lineups',
        'GET',
        status,
        !meta.errorsText,
        `fixture=${fixtureId} sides=${arr.length}${meta.errorsText ? ` errors=${meta.errorsText}` : ''}`,
      );
      return { status, response: arr, raw: body };
    } catch (e) {
      const statusCode = isAxiosError(e) ? e.response?.status ?? null : null;
      const msg = e instanceof Error ? e.message : String(e);
      await this.log(
        '/fixtures/lineups',
        'GET',
        statusCode,
        false,
        `fixture=${fixtureId} ${msg}`,
      );
      throw e;
    }
  }

  /** GET /fixtures/statistics?fixture= — 两队技术统计（赛前可能为空） */
  async getFixtureStatistics(fixtureId: number): Promise<{
    status: number;
    response: unknown[];
    raw: Record<string, unknown>;
  }> {
    const http = this.client();
    try {
      const { data, status } = await this.getWith429Retry<Record<string, unknown>>(
        http,
        '/fixtures/statistics',
        { params: { fixture: fixtureId } },
      );
      const body = data ?? {};
      const arr = Array.isArray(body.response) ? body.response : [];
      const meta = summarizeApiSportsErrors(body);
      await this.log(
        '/fixtures/statistics',
        'GET',
        status,
        !meta.errorsText,
        `fixture=${fixtureId} rows=${arr.length}${meta.errorsText ? ` errors=${meta.errorsText}` : ''}`,
      );
      return { status, response: arr, raw: body };
    } catch (e) {
      const statusCode = isAxiosError(e) ? e.response?.status ?? null : null;
      const msg = e instanceof Error ? e.message : String(e);
      await this.log(
        '/fixtures/statistics',
        'GET',
        statusCode,
        false,
        `fixture=${fixtureId} ${msg}`,
      );
      throw e;
    }
  }

  /** GET /fixtures/events?fixture= — 进球/换人/红黄牌等事件 */
  async getFixtureEvents(fixtureId: number): Promise<{
    status: number;
    response: unknown[];
    raw: Record<string, unknown>;
  }> {
    const http = this.client();
    try {
      const { data, status } = await this.getWith429Retry<Record<string, unknown>>(
        http,
        '/fixtures/events',
        { params: { fixture: fixtureId } },
      );
      const body = data ?? {};
      const arr = Array.isArray(body.response) ? body.response : [];
      const meta = summarizeApiSportsErrors(body);
      await this.log(
        '/fixtures/events',
        'GET',
        status,
        !meta.errorsText,
        `fixture=${fixtureId} events=${arr.length}${meta.errorsText ? ` errors=${meta.errorsText}` : ''}`,
      );
      return { status, response: arr, raw: body };
    } catch (e) {
      const statusCode = isAxiosError(e) ? e.response?.status ?? null : null;
      const msg = e instanceof Error ? e.message : String(e);
      await this.log(
        '/fixtures/events',
        'GET',
        statusCode,
        false,
        `fixture=${fixtureId} ${msg}`,
      );
      throw e;
    }
  }

  /** GET /teams?league=&season= — 联赛球队列表（单页，通常一页足够） */
  async getTeamsInLeague(league: number, season: number): Promise<{
    status: number;
    items: unknown[];
    errors?: unknown;
    results?: number;
  }> {
    const http = this.client();
    const { data, status } = await this.getWith429Retry(http, '/teams', {
      params: { league, season },
    });
    const body = data as Record<string, unknown>;
    const response = Array.isArray(body.response) ? body.response : [];
    const meta = summarizeApiSportsErrors(body);
    await this.log(
      '/teams',
      'GET',
      status,
      !meta.errorsText,
      `league=${league} season=${season} rows=${response.length}${
        meta.results != null ? ` results=${meta.results}` : ''
      }${meta.errorsText ? ` errors=${meta.errorsText}` : ''}`,
    );
    return {
      status,
      items: response,
      errors: body.errors,
      results: meta.results,
    };
  }

  /** GET /teams?id= — 单支球队卡片（国家、成立年等） */
  async getTeamById(teamId: number): Promise<{
    status: number;
    item: Record<string, unknown> | null;
    raw: Record<string, unknown>;
  }> {
    const http = this.client();
    try {
      const { data, status } = await this.getWith429Retry<Record<string, unknown>>(http, '/teams', {
        params: { id: teamId },
      });
      const body = data ?? {};
      const resp = body.response;
      let first: Record<string, unknown> | null = null;
      if (Array.isArray(resp) && resp.length) {
        const row = resp[0] as Record<string, unknown>;
        const nested = row?.team as Record<string, unknown> | undefined;
        first = nested && typeof nested === 'object' ? nested : row;
      } else if (resp && typeof resp === 'object' && !Array.isArray(resp)) {
        const row = resp as Record<string, unknown>;
        const nested = row.team as Record<string, unknown> | undefined;
        first = nested && typeof nested === 'object' ? nested : row;
      }
      const meta = summarizeApiSportsErrors(body);
      await this.log(
        '/teams',
        'GET',
        status,
        !meta.errorsText,
        `id=${teamId}${meta.errorsText ? ` errors=${meta.errorsText}` : ''}`,
      );
      return { status, item: first, raw: body };
    } catch (e) {
      const statusCode = isAxiosError(e) ? e.response?.status ?? null : null;
      const msg = e instanceof Error ? e.message : String(e);
      await this.log('/teams', 'GET', statusCode, false, `id=${teamId} ${msg}`);
      throw e;
    }
  }

  /**
   * GET /teams/statistics?team=&league=&season=
   * 国家队/杯赛维度赛季统计（世界杯 `league=1`）。
   */
  async getTeamStatistics(params: {
    teamId: number;
    league: number;
    season: number;
  }): Promise<{
    status: number;
    statistics: Record<string, unknown> | null;
    raw: Record<string, unknown>;
  }> {
    const http = this.client();
    try {
      const { data, status } = await this.getWith429Retry<Record<string, unknown>>(
        http,
        '/teams/statistics',
        {
          params: {
            team: params.teamId,
            league: params.league,
            season: params.season,
          },
        },
      );
      const body = data ?? {};
      const meta = summarizeApiSportsErrors(body);
      const resp = body.response;
      let statistics: Record<string, unknown> | null = null;
      if (Array.isArray(resp) && resp.length) {
        statistics = resp[0] as Record<string, unknown>;
      } else if (resp && typeof resp === 'object' && !Array.isArray(resp)) {
        statistics = resp as Record<string, unknown>;
      }
      await this.log(
        '/teams/statistics',
        'GET',
        status,
        !meta.errorsText,
        `team=${params.teamId} league=${params.league} season=${params.season}${
          meta.errorsText ? ` errors=${meta.errorsText}` : ''
        }`,
      );
      return { status, statistics, raw: body };
    } catch (e) {
      const statusCode = isAxiosError(e) ? e.response?.status ?? null : null;
      const msg = e instanceof Error ? e.message : String(e);
      await this.log(
        '/teams/statistics',
        'GET',
        statusCode,
        false,
        `team=${params.teamId} league=${params.league} season=${params.season} ${msg}`,
      );
      throw e;
    }
  }

  /** GET /standings?league=&season= */
  async getStandings(league: number, season: number): Promise<{
    status: number;
    response: unknown[];
    raw: Record<string, unknown>;
  }> {
    const http = this.client();
    try {
      const { data, status } = await this.getWith429Retry<Record<string, unknown>>(
        http,
        '/standings',
        { params: { league, season } },
      );
      const body = data ?? {};
      const arr = Array.isArray(body.response) ? body.response : [];
      const meta = summarizeApiSportsErrors(body);
      await this.log(
        '/standings',
        'GET',
        status,
        !meta.errorsText,
        `league=${league} season=${season} groups=${arr.length}${meta.errorsText ? ` errors=${meta.errorsText}` : ''}`,
      );
      return { status, response: arr, raw: body };
    } catch (e) {
      const statusCode = isAxiosError(e) ? e.response?.status ?? null : null;
      const msg = e instanceof Error ? e.message : String(e);
      await this.log('/standings', 'GET', statusCode, false, `league=${league} ${msg}`);
      throw e;
    }
  }

  /** GET /injuries?fixture= 或 team+season+league */
  async getInjuries(params: {
    fixture?: number;
    team?: number;
    season?: number;
    league?: number;
  }): Promise<{
    status: number;
    response: unknown[];
    raw: Record<string, unknown>;
  }> {
    const http = this.client();
    const q: Record<string, number> = {};
    if (params.fixture != null) q.fixture = params.fixture;
    if (params.team != null) q.team = params.team;
    if (params.season != null) q.season = params.season;
    if (params.league != null) q.league = params.league;
    try {
      const { data, status } = await this.getWith429Retry<Record<string, unknown>>(
        http,
        '/injuries',
        { params: q },
      );
      const body = data ?? {};
      const arr = Array.isArray(body.response) ? body.response : [];
      const meta = summarizeApiSportsErrors(body);
      await this.log(
        '/injuries',
        'GET',
        status,
        !meta.errorsText,
        `rows=${arr.length}${meta.errorsText ? ` errors=${meta.errorsText}` : ''}`,
      );
      return { status, response: arr, raw: body };
    } catch (e) {
      const statusCode = isAxiosError(e) ? e.response?.status ?? null : null;
      const msg = e instanceof Error ? e.message : String(e);
      await this.log('/injuries', 'GET', statusCode, false, msg);
      throw e;
    }
  }

  /** GET /odds?fixture= */
  async getOdds(fixtureId: number): Promise<{
    status: number;
    response: unknown[];
    raw: Record<string, unknown>;
  }> {
    const http = this.client();
    try {
      const { data, status } = await this.getWith429Retry<Record<string, unknown>>(
        http,
        '/odds',
        { params: { fixture: fixtureId } },
      );
      const body = data ?? {};
      const arr = Array.isArray(body.response) ? body.response : [];
      const meta = summarizeApiSportsErrors(body);
      await this.log(
        '/odds',
        'GET',
        status,
        !meta.errorsText,
        `fixture=${fixtureId} bookmakers=${arr.length}${meta.errorsText ? ` errors=${meta.errorsText}` : ''}`,
      );
      return { status, response: arr, raw: body };
    } catch (e) {
      const statusCode = isAxiosError(e) ? e.response?.status ?? null : null;
      const msg = e instanceof Error ? e.message : String(e);
      await this.log('/odds', 'GET', statusCode, false, `fixture=${fixtureId} ${msg}`);
      throw e;
    }
  }

  /** GET /fixtures?team=&last= — 球队最近 N 场（疲劳指数） */
  async getTeamRecentFixtures(teamId: number, last: number): Promise<{
    status: number;
    response: unknown[];
    raw: Record<string, unknown>;
  }> {
    const http = this.client();
    try {
      const { data, status } = await this.getWith429Retry<Record<string, unknown>>(
        http,
        '/fixtures',
        { params: { team: teamId, last: Math.min(20, Math.max(1, last)) } },
      );
      const body = data ?? {};
      const arr = Array.isArray(body.response) ? body.response : [];
      const meta = summarizeApiSportsErrors(body);
      await this.log(
        '/fixtures',
        'GET',
        status,
        !meta.errorsText,
        `team=${teamId} last=${last} rows=${arr.length}${meta.errorsText ? ` errors=${meta.errorsText}` : ''}`,
      );
      return { status, response: arr, raw: body };
    } catch (e) {
      const statusCode = isAxiosError(e) ? e.response?.status ?? null : null;
      const msg = e instanceof Error ? e.message : String(e);
      await this.log('/fixtures', 'GET', statusCode, false, `team=${teamId} last=${last} ${msg}`);
      throw e;
    }
  }

  /** 别名：GET /players?team=&season=&page= */
  getPlayersByTeam(
    teamId: number,
    season: number,
    opts?: { page?: number },
  ) {
    return this.getPlayersPage({ team: teamId, season, page: opts?.page });
  }

  /**
   * C 端只读代理：转发到 v3.football.api-sports.io，**不写 ApiLog**（避免每次列表请求刷库）。
   * 仅允许白名单 path；Key 仍在服务端。
   */
  async passThroughGet(
    path: string,
    params: Record<string, string | number | boolean | undefined>,
  ): Promise<Record<string, unknown>> {
    if (!FOOTBALL_API_PASS_THROUGH_PATHS.has(path)) {
      throw new BadRequestException(`不允许的上游路径: ${path}`);
    }
    const http = this.client();
    const clean: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (v === '') continue;
      if (typeof v === 'boolean') clean[k] = v ? 1 : 0;
      else clean[k] = v;
    }
    try {
      const res = await this.getWith429Retry<Record<string, unknown>>(http, path, {
        params: clean,
      });
      return (res.data ?? {}) as Record<string, unknown>;
    } catch (e) {
      const st = isAxiosError(e) ? e.response?.status : null;
      this.logger.warn(
        `passThrough ${path} failed status=${st} ${e instanceof Error ? e.message : String(e)}`,
      );
      throw e;
    }
  }

  /**
   * GET /status — api-sports 控制台中的订阅、当日剩余请求等（开通会员后用于探活）。
   * @see https://www.api-football.com/documentation-v3
   */
  async getSubscriptionStatus(): Promise<{
    httpStatus: number;
    body: Record<string, unknown>;
    errorsText?: string;
  }> {
    const http = this.client();
    const { data, status } = await this.getWith429Retry<Record<string, unknown>>(http, '/status');
    const body = (data ?? {}) as Record<string, unknown>;
    const meta = summarizeApiSportsErrors(body);
    await this.log(
      '/status',
      'GET',
      status,
      !meta.errorsText,
      meta.errorsText ? `errors=${meta.errorsText}` : 'subscription probe',
    );
    return {
      httpStatus: status,
      body,
      errorsText: meta.errorsText || undefined,
    };
  }

  async sleep(ms: number) {
    await new Promise((r) => setTimeout(r, ms));
  }
}
