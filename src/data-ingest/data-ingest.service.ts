import { BadRequestException, Injectable } from '@nestjs/common';
import { MatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FdFinishedIngestService } from './fd-finished-ingest.service';
import { FdPlayerIngestService } from './fd-player-ingest.service';
import { OpenFootballIngestService } from './openfootball-ingest.service';
import { RawPayloadStructureService } from './raw-payload-structure.service';
import { PlayerIngestAuditService } from './player-ingest-audit.service';
import { FbrefCsvIngestService } from './fbref-csv-ingest.service';
import { ApiFootballIngestService } from '../api-football/api-football-ingest.service';
import { MatchAfFactsSyncService } from '../api-football/match-af-facts-sync.service';
import { MatchAfPreMatchSnapshotService } from '../api-football/match-af-pre-match-snapshot.service';
import { MatchOddsSnapshotService } from '../api-football/match-odds-snapshot.service';
import { StatsbombIngestService } from './statsbomb-ingest.service';
import {
  statsbombMappingsFromPreset,
  type StatsbombAutoMapPreset,
} from '../common/constants/statsbomb-auto-map.constant';

@Injectable()
export class DataIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fdFinished: FdFinishedIngestService,
    private readonly fdPlayers: FdPlayerIngestService,
    private readonly openFootball: OpenFootballIngestService,
    private readonly statsbomb: StatsbombIngestService,
    private readonly rawStructure: RawPayloadStructureService,
    private readonly playerAudit: PlayerIngestAuditService,
    private readonly fbrefCsv: FbrefCsvIngestService,
    private readonly apiFootballIngest: ApiFootballIngestService,
    private readonly matchAfFacts: MatchAfFactsSyncService,
    private readonly preMatchSnapshots: MatchAfPreMatchSnapshotService,
    private readonly oddsSnapshots: MatchOddsSnapshotService,
  ) {}

  async runFdFinishedJob(body: {
    codes: string[];
    dateFrom: string;
    dateTo: string;
  }) {
    const job = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'FD_FINISHED_RANGE',
        status: 'RUNNING',
        params: body as object,
      },
    });
    try {
      const result = await this.fdFinished.ingestFinishedRange(body);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          resultSummary: result as object,
          finishedAt: new Date(),
        },
      });
      return { jobId: job.id, result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: msg,
          finishedAt: new Date(),
        },
      });
      throw e;
    }
  }

  async runStatsbombOpenDataJob(body: {
    sbCompetitionId: number;
    sbSeasonId: number;
    competitionCode: string;
    baseUrl?: string;
    maxMatches?: number;
    delayMs?: number;
    maxEventsStored?: number;
    skipCreateMatch?: boolean;
  }) {
    const job = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'STATSBOMB_OPEN_DATA',
        status: 'RUNNING',
        params: body as object,
      },
    });
    try {
      const result = await this.statsbomb.ingestCompetitionSeason(body);
      const failed = result && typeof result === 'object' && 'ok' in result && result.ok === false;
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: failed ? 'FAILED' : 'SUCCEEDED',
          resultSummary: result as object,
          finishedAt: new Date(),
        },
      });
      return { jobId: job.id, result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: msg,
          finishedAt: new Date(),
        },
      });
      throw e;
    }
  }

  /** 只读：README 目录 `competitions.json` + 可选场次文件条数探测。 */
  auditStatsbombOpenDataCatalog(opts: {
    baseUrl?: string;
    includeMatchFileCounts?: boolean;
    probeLimit?: number;
    delayBetweenProbeMs?: number;
  }) {
    return this.statsbomb.auditOpenDataCatalog(opts);
  }

  async runStatsbombOpenDataBatchJob(body: {
    mappings?: { sbCompetitionId: number; competitionCode: string }[];
    preset?: StatsbombAutoMapPreset;
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
    let list: { sbCompetitionId: number; competitionCode: string }[] = [];
    if (body.preset) {
      list = statsbombMappingsFromPreset(body.preset);
    } else {
      list = (body.mappings ?? []).filter((m) => m && Number.isFinite(m.sbCompetitionId));
    }
    if (!list.length) {
      throw new BadRequestException(
        '请提供 mappings，或设置 preset 为 BIG5_EURO / ALL_MAPPED（内置 competition_id→本地 code，见 statsbomb-auto-map.constant）',
      );
    }
    const idToCode: Record<string, string> = {};
    for (const m of list) {
      idToCode[String(m.sbCompetitionId)] = m.competitionCode.trim().toUpperCase();
    }
    const job = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'STATSBOMB_OPEN_DATA_BATCH',
        status: 'RUNNING',
        params: {
          ...body,
          sbCompetitionIdToCode: idToCode,
        } as object,
      },
    });
    try {
      const result = await this.statsbomb.ingestOpenDataCatalogBatch({
        baseUrl: body.baseUrl,
        sbCompetitionIdToCode: idToCode,
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
      });

      const totals = (result as { totals?: { pairOk?: number; pairFail?: number } }).totals;
      const planned = (result as { plannedPairs?: number }).plannedPairs ?? 0;
      const pairFail = totals?.pairFail ?? 0;
      const pairOk = totals?.pairOk ?? 0;
      const allFailed =
        planned > 0 && body.dryRun !== true && pairFail > 0 && pairOk === 0;

      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: allFailed ? 'FAILED' : 'SUCCEEDED',
          resultSummary: result as object,
          finishedAt: new Date(),
        },
      });
      return { jobId: job.id, result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: msg,
          finishedAt: new Date(),
        },
      });
      throw e;
    }
  }

  async runOpenFootballJob(body: {
    leagueKey: string;
    competitionCode: string;
    seasonFolder?: string;
    url?: string;
  }) {
    const job = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'OPENFOOTBALL_LEAGUE_JSON',
        status: 'RUNNING',
        params: body as object,
      },
    });
    try {
      const result = await this.openFootball.importLeagueJson(body);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: result && typeof result === 'object' && 'ok' in result && result.ok === false
            ? 'FAILED'
            : 'SUCCEEDED',
          resultSummary: result as object,
          finishedAt: new Date(),
        },
      });
      return { jobId: job.id, result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: msg,
          finishedAt: new Date(),
        },
      });
      throw e;
    }
  }

  async runFdPlayerSquadsJob(body: {
    codes: string[];
    delayBetweenTeamMs: number;
    delayBetweenPersonMs: number;
    enrichPerson: boolean;
    enrichCoach: boolean;
    coachMatchDetailSample: number;
    updateTeamMeta: boolean;
  }) {
    const job = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'FD_PLAYER_SQUADS',
        status: 'RUNNING',
        params: body as object,
      },
    });
    try {
      const result = await this.fdPlayers.ingestSquads(body);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          resultSummary: result as object,
          finishedAt: new Date(),
        },
      });
      return { jobId: job.id, result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: msg,
          finishedAt: new Date(),
        },
      });
      throw e;
    }
  }

  async listRecentJobs(take = 20) {
    return this.prisma.ingestJobRun.findMany({
      orderBy: { startedAt: 'desc' },
      take,
    });
  }

  /** 只读：球员/多源覆盖度审计（不写 IngestJobRun）。 */
  async getPlayerIngestAudit() {
    return this.playerAudit.buildReport();
  }

  async runApiFootballFixturesJob(body: {
    competitionCodes: string[];
    season: number;
    delayBetweenRequestsMs?: number;
    maxPagesPerLeague?: number;
  }) {
    const job = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'API_FOOTBALL_FIXTURES',
        status: 'RUNNING',
        params: body as object,
      },
    });
    try {
      const result = await this.apiFootballIngest.syncFixtures(body);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          resultSummary: result as object,
          finishedAt: new Date(),
        },
      });
      return { jobId: job.id, result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: msg,
          finishedAt: new Date(),
        },
      });
      throw e;
    }
  }

  async runApiFootballSquadsJob(body: {
    competitionCodes: string[];
    season: number;
    delayBetweenRequestsMs?: number;
    maxTeamsPerLeague?: number;
  }) {
    const job = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'API_FOOTBALL_SQUADS',
        status: 'RUNNING',
        params: body as object,
      },
    });
    try {
      const result = await this.apiFootballIngest.syncSquads(body);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          resultSummary: result as object,
          finishedAt: new Date(),
        },
      });
      return { jobId: job.id, result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: msg,
          finishedAt: new Date(),
        },
      });
      throw e;
    }
  }

  async runApiFootballMatchFactsBatchJob(body: {
    competitionId?: string;
    status?: 'FINISHED' | 'SCHEDULED' | 'LIVE';
    maxMatches?: number;
    delayBetweenMatchesMs?: number;
    onlyMissing?: boolean;
    lookbackDays?: number;
    force?: boolean;
  }) {
    const job = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'API_FOOTBALL_MATCH_FACTS_BATCH',
        status: 'RUNNING',
        params: body as object,
      },
    });
    try {
      const statusFilter = body.status ?? 'FINISHED';
      const lookbackDays = Math.min(365, Math.max(1, body.lookbackDays ?? 30));
      const since = new Date(Date.now() - lookbackDays * 86_400_000);
      const where: Prisma.MatchWhereInput = {
        externalId: { startsWith: 'af-f-' },
        status: statusFilter as MatchStatus,
        kickoffTime: { gte: since },
      };
      if (body.competitionId?.trim()) {
        where.competitionId = body.competitionId.trim();
      }

      const maxM = Math.min(500, Math.max(1, body.maxMatches ?? 40));
      const rows = await this.prisma.match.findMany({
        where,
        orderBy: [{ isFeatured: 'desc' }, { kickoffTime: 'desc' }],
        take: maxM,
        select: { id: true },
      });

      const delayB = Math.min(30_000, Math.max(0, body.delayBetweenMatchesMs ?? 800));
      const force = body.force === true;
      let succeeded = 0;
      let skipped = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const row of rows) {
        try {
          const out = await this.matchAfFacts.syncByMatchId(row.id, {
            delayMs: 400,
            force: force || body.onlyMissing === false,
          });
          if (out.detail.skipped === true) {
            skipped += 1;
          } else {
            succeeded += 1;
          }
        } catch (e: unknown) {
          failed += 1;
          if (errors.length < 40) {
            errors.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (delayB > 0) {
          await new Promise((r) => setTimeout(r, delayB));
        }
      }

      const result = { attempted: rows.length, succeeded, skipped, failed, errors };
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          resultSummary: result as object,
          finishedAt: new Date(),
        },
      });
      return { jobId: job.id, result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: msg,
          finishedAt: new Date(),
        },
      });
      throw e;
    }
  }

  /** 验收：抽样统计 `af-f-*` 场次 MatchFacts 字段非空率 */
  async getApiFootballMatchFactsCoverage(opts: {
    competitionId?: string;
    status?: 'FINISHED' | 'SCHEDULED' | 'LIVE';
    sample?: number;
    lookbackDays?: number;
  }) {
    const statusFilter = opts.status ?? 'FINISHED';
    const sample = Math.min(500, Math.max(1, opts.sample ?? 50));
    const lookbackDays = Math.min(365, Math.max(1, opts.lookbackDays ?? 30));
    const since = new Date(Date.now() - lookbackDays * 86_400_000);

    const where: Prisma.MatchWhereInput = {
      externalId: { startsWith: 'af-f-' },
      status: statusFilter as MatchStatus,
      kickoffTime: { gte: since },
    };
    if (opts.competitionId?.trim()) {
      where.competitionId = opts.competitionId.trim();
    }

    const total = await this.prisma.match.count({ where });
    const rows = await this.prisma.match.findMany({
      where,
      orderBy: { kickoffTime: 'desc' },
      take: sample,
      select: {
        id: true,
        matchFacts: {
          select: {
            lineups: true,
            events: true,
            teamStats: true,
            rawAfFixture: true,
          },
        },
      },
    });

    const arrayNonEmpty = (v: unknown) => Array.isArray(v) && v.length > 0;
    const rawNonEmpty = (v: unknown) =>
      v != null && typeof v === 'object' && !Array.isArray(v);

    let lineupsOk = 0;
    let eventsOk = 0;
    let statsOk = 0;
    let rawOk = 0;
    const missingMatchIds: string[] = [];

    for (const row of rows) {
      const f = row.matchFacts;
      const hasL = arrayNonEmpty(f?.lineups);
      const hasE = arrayNonEmpty(f?.events);
      const hasS = arrayNonEmpty(f?.teamStats);
      const hasR = rawNonEmpty(f?.rawAfFixture);
      if (hasL) lineupsOk += 1;
      if (hasE) eventsOk += 1;
      if (hasS) statsOk += 1;
      if (hasR) rawOk += 1;
      if ((!hasL || !hasE || !hasS) && missingMatchIds.length < 20) {
        missingMatchIds.push(row.id);
      }
    }

    const denom = rows.length || 1;
    return {
      total,
      sampled: rows.length,
      lookbackDays,
      status: statusFilter,
      rates: {
        lineups: lineupsOk / denom,
        events: eventsOk / denom,
        teamStats: statsOk / denom,
        rawAfFixture: rawOk / denom,
      },
      counts: {
        lineups: lineupsOk,
        events: eventsOk,
        teamStats: statsOk,
        rawAfFixture: rawOk,
      },
      missingMatchIds,
    };
  }

  /** 验收：预测/OLS 输入字段覆盖率（TeamMatchSnapshot + Player + Odds T24/T1） */
  async getPredictionInputCoverage(opts: {
    competitionId?: string;
    status?: 'FINISHED' | 'SCHEDULED' | 'LIVE';
    sample?: number;
    lookbackDays?: number;
  }) {
    const statusFilter = opts.status ?? 'SCHEDULED';
    const sample = Math.min(500, Math.max(1, opts.sample ?? 50));
    const lookbackDays = Math.min(90, Math.max(1, opts.lookbackDays ?? 30));
    const since = new Date(Date.now() - lookbackDays * 86_400_000);
    const where: Prisma.MatchWhereInput = {
      externalId: { startsWith: 'af-f-' },
      status: statusFilter as MatchStatus,
      kickoffTime: { gte: since },
    };
    if (opts.competitionId?.trim()) {
      where.competitionId = opts.competitionId.trim();
    }

    const total = await this.prisma.match.count({ where });
    const rows = await this.prisma.match.findMany({
      where,
      orderBy: { kickoffTime: 'desc' },
      take: sample,
      select: {
        id: true,
        afOddsSnapshot24At: true,
        afOddsSnapshot1At: true,
        teamSnapshots: {
          select: {
            leagueRank: true,
            recentForm: true,
            injuryImpact: true,
            fatigueIndex: true,
            goalsForAvg: true,
          },
        },
        playerSnapshots: { select: { formScore: true } },
      },
    });

    let rankOk = 0;
    let formOk = 0;
    let injurySet = 0;
    let playerFormOk = 0;
    let oddsT24 = 0;
    let oddsT1 = 0;
    const missingMatchIds: string[] = [];

    for (const row of rows) {
      const teams = row.teamSnapshots;
      const hasRank = teams.some((t) => t.leagueRank != null);
      const hasForm = teams.some((t) => t.recentForm && t.recentForm.length > 0);
      const hasInjury = teams.some((t) => t.injuryImpact != null && t.injuryImpact > 0);
      if (hasRank) rankOk += 1;
      if (hasForm) formOk += 1;
      if (hasInjury || teams.length >= 2) injurySet += 1;
      if (row.playerSnapshots.some((p) => p.formScore != null)) playerFormOk += 1;
      if (row.afOddsSnapshot24At) oddsT24 += 1;
      if (row.afOddsSnapshot1At) oddsT1 += 1;
      if ((!hasRank || !hasForm) && missingMatchIds.length < 20) {
        missingMatchIds.push(row.id);
      }
    }

    const denom = rows.length || 1;
    return {
      total,
      sampled: rows.length,
      lookbackDays,
      status: statusFilter,
      rates: {
        leagueRank: rankOk / denom,
        recentForm: formOk / denom,
        injuryOrTeams: injurySet / denom,
        playerFormScore: playerFormOk / denom,
        oddsT24: oddsT24 / denom,
        oddsT1: oddsT1 / denom,
      },
      counts: {
        leagueRank: rankOk,
        recentForm: formOk,
        playerFormScore: playerFormOk,
        oddsT24,
        oddsT1,
      },
      missingMatchIds,
    };
  }

  async runApiFootballPreMatchSnapshotBatchJob(body: {
    competitionId?: string;
    maxMatches?: number;
    delayBetweenMatchesMs?: number;
    force?: boolean;
  }) {
    const job = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'API_FOOTBALL_PRE_MATCH_BATCH',
        status: 'RUNNING',
        params: body as object,
      },
    });
    try {
      const where: Prisma.MatchWhereInput = {
        externalId: { startsWith: 'af-f-' },
        status: MatchStatus.SCHEDULED,
      };
      if (body.competitionId?.trim()) {
        where.competitionId = body.competitionId.trim();
      }
      const maxM = Math.min(200, Math.max(1, body.maxMatches ?? 30));
      const rows = await this.prisma.match.findMany({
        where,
        orderBy: [{ isFeatured: 'desc' }, { kickoffTime: 'asc' }],
        take: maxM,
        select: { id: true },
      });
      const delayB = Math.min(30_000, Math.max(0, body.delayBetweenMatchesMs ?? 900));
      let succeeded = 0;
      let failed = 0;
      const errors: string[] = [];
      for (const row of rows) {
        try {
          await this.preMatchSnapshots.syncByMatchId(row.id, {
            delayMs: 400,
            force: body.force === true,
          });
          succeeded += 1;
        } catch (e: unknown) {
          failed += 1;
          if (errors.length < 30) {
            errors.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (delayB > 0) await new Promise((r) => setTimeout(r, delayB));
      }
      const result = { attempted: rows.length, succeeded, failed, errors };
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: { status: 'SUCCEEDED', resultSummary: result as object, finishedAt: new Date() },
      });
      return { jobId: job.id, result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorMessage: msg, finishedAt: new Date() },
      });
      throw e;
    }
  }

  async runOddsCaptureBatchJob(body: {
    matchId?: string;
    competitionId?: string;
    phase: 'T24' | 'T1' | 'LIVE';
    maxMatches?: number;
    delayBetweenMatchesMs?: number;
    force?: boolean;
  }) {
    const job = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'API_FOOTBALL_ODDS_CAPTURE_BATCH',
        status: 'RUNNING',
        params: body as object,
      },
    });
    try {
      let ids: string[] = [];
      if (body.matchId?.trim()) {
        ids = [body.matchId.trim()];
      } else {
        const where: Prisma.MatchWhereInput = {
          externalId: { startsWith: 'af-f-' },
          status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
        };
        if (body.competitionId?.trim()) {
          where.competitionId = body.competitionId.trim();
        }
        const maxM = Math.min(100, Math.max(1, body.maxMatches ?? 20));
        const rows = await this.prisma.match.findMany({
          where,
          orderBy: { kickoffTime: 'asc' },
          take: maxM,
          select: { id: true },
        });
        ids = rows.map((r) => r.id);
      }
      const delayB = Math.min(30_000, Math.max(0, body.delayBetweenMatchesMs ?? 800));
      let succeeded = 0;
      let skipped = 0;
      let failed = 0;
      for (const id of ids) {
        try {
          const out = await this.oddsSnapshots.captureByMatchId(id, body.phase, {
            force: body.force === true,
          });
          if (out.skipped) skipped += 1;
          else succeeded += 1;
        } catch {
          failed += 1;
        }
        if (delayB > 0) await new Promise((r) => setTimeout(r, delayB));
      }
      const result = { attempted: ids.length, succeeded, skipped, failed };
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: { status: 'SUCCEEDED', resultSummary: result as object, finishedAt: new Date() },
      });
      return { jobId: job.id, result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorMessage: msg, finishedAt: new Date() },
      });
      throw e;
    }
  }

  async runFbrefPlayersCsvJob(body: {
    csvText: string;
    competitionCode: string;
    seasonTag: string;
    originalFileName?: string;
  }) {
    const job = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'FBREF_PLAYERS_CSV',
        status: 'RUNNING',
        params: {
          competitionCode: body.competitionCode,
          seasonTag: body.seasonTag,
          fileName: body.originalFileName,
        } as object,
      },
    });
    try {
      const result = await this.fbrefCsv.ingestPlayerStatsCsv(body);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          resultSummary: result as object,
          finishedAt: new Date(),
        },
      });
      return { jobId: job.id, result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: msg,
          finishedAt: new Date(),
        },
      });
      throw e;
    }
  }

  /** 写入 IngestJobRun（PLAYER_DATA_AUDIT）并返回同 getPlayerIngestAudit 结构。 */
  async runPlayerIngestAuditJob() {
    const job = await this.prisma.ingestJobRun.create({
      data: {
        kind: 'PLAYER_DATA_AUDIT',
        status: 'RUNNING',
        params: {},
      },
    });
    try {
      const result = await this.playerAudit.buildReport();
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          resultSummary: result as object,
          finishedAt: new Date(),
        },
      });
      return { jobId: job.id, result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.ingestJobRun.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: msg,
          finishedAt: new Date(),
        },
      });
      throw e;
    }
  }

  /** 管理后台预览：原始文本 → DeepSeek + Zod（不落库） */
  structureRawPreview(rawText: string, opts?: { hint?: string; maxAttempts?: number }) {
    return this.rawStructure.structureMatchFactsEnvelope(rawText, {
      hint: opts?.hint,
      maxAttempts: opts?.maxAttempts,
    });
  }
}
