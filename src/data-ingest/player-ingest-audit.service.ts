import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { defaultOpenFootballRawUrl } from './openfootball-timezones';

/** 库内球员与多源入库的可视化审计（不落业务表，可写入 IngestJobRun）。 */
@Injectable()
export class PlayerIngestAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** 固定路径，避免动态 SQL；需 MySQL JSON_CONTAINS_PATH。 */
  private async countPlayersJsonPath(
    path:
      | '$.fdSquad'
      | '$.fdPerson'
      | '$.fbref'
      | '$.apiFootball'
      | '$.understat'
      | '$.transfermarkt',
  ): Promise<number> {
    const q =
      path === '$.fdSquad' ?
        this.prisma.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*) AS c FROM Player
        WHERE profile IS NOT NULL AND JSON_CONTAINS_PATH(profile, 'one', '$.fdSquad')
      `
      : path === '$.fdPerson' ?
        this.prisma.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*) AS c FROM Player
        WHERE profile IS NOT NULL AND JSON_CONTAINS_PATH(profile, 'one', '$.fdPerson')
      `
      : path === '$.fbref' ?
        this.prisma.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*) AS c FROM Player
        WHERE profile IS NOT NULL AND JSON_CONTAINS_PATH(profile, 'one', '$.fbref')
      `
      : path === '$.apiFootball' ?
        this.prisma.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*) AS c FROM Player
        WHERE profile IS NOT NULL AND JSON_CONTAINS_PATH(profile, 'one', '$.apiFootball')
      `
      : path === '$.understat' ?
        this.prisma.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*) AS c FROM Player
        WHERE profile IS NOT NULL AND JSON_CONTAINS_PATH(profile, 'one', '$.understat')
      `
      : this.prisma.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*) AS c FROM Player
        WHERE profile IS NOT NULL AND JSON_CONTAINS_PATH(profile, 'one', '$.transfermarkt')
      `;
    const rows = await q;
    return Number(rows[0]?.c ?? 0);
  }

  private async countMatchFactsLineups(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM MatchFacts WHERE lineups IS NOT NULL
    `;
    return Number(rows[0]?.c ?? 0);
  }

  async probeOpenFootballDefaultJson(): Promise<{
    ok: boolean;
    url: string;
    status?: number;
    error?: string;
  }> {
    const url = defaultOpenFootballRawUrl('en.1', '2024-25');
    try {
      const res = await axios.get(url, {
        timeout: 20_000,
        responseType: 'json',
        maxContentLength: 2_000_000,
        validateStatus: () => true,
      });
      const ok = res.status === 200 && res.data && typeof res.data === 'object';
      return { ok, url, status: res.status };
    } catch (e) {
      return {
        ok: false,
        url,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async buildReport(): Promise<Record<string, unknown>> {
    const [
      playerTotal,
      withExternalId,
      bySource,
      withFdSquad,
      withFdPerson,
      withFbref,
      withApiFootball,
      withUnderstat,
      withTransfermarkt,
      matchFactsWithLineups,
      teamTotal,
      teamsBySource,
    ] = await Promise.all([
      this.prisma.player.count(),
      this.prisma.player.count({ where: { externalId: { not: null } } }),
      this.prisma.player.groupBy({
        by: ['dataSource'],
        _count: { _all: true },
      }),
      this.countPlayersJsonPath('$.fdSquad'),
      this.countPlayersJsonPath('$.fdPerson'),
      this.countPlayersJsonPath('$.fbref'),
      this.countPlayersJsonPath('$.apiFootball'),
      this.countPlayersJsonPath('$.understat'),
      this.countPlayersJsonPath('$.transfermarkt'),
      this.countMatchFactsLineups(),
      this.prisma.team.count(),
      this.prisma.team.groupBy({
        by: ['dataSource'],
        _count: { _all: true },
      }),
    ]);

    const ingestPlayerRelated = await this.prisma.ingestJobRun.findMany({
      where: {
        kind: {
          in: [
            'FD_PLAYER_SQUADS',
            'PLAYER_DATA_AUDIT',
            'OPENFOOTBALL_LEAGUE_JSON',
            'FBREF_PLAYERS_CSV',
            'API_FOOTBALL_FIXTURES',
            'API_FOOTBALL_SQUADS',
            'STATSBOMB_OPEN_DATA',
            'STATSBOMB_OPEN_DATA_BATCH',
          ],
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        kind: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        errorMessage: true,
      },
    });

    const openFootballProbe = await this.probeOpenFootballDefaultJson();

    return {
      generatedAt: new Date().toISOString(),
      players: {
        total: playerTotal,
        withExternalId,
        withProfileFdSquad: withFdSquad,
        withProfileFdPerson: withFdPerson,
        withProfileFbref: withFbref,
        withProfileApiFootball: withApiFootball,
        withProfileUnderstat: withUnderstat,
        withProfileTransfermarkt: withTransfermarkt,
        byDataSource: bySource.map((r) => ({
          dataSource: r.dataSource,
          count: r._count._all,
        })),
      },
      teams: {
        total: teamTotal,
        byDataSource: teamsBySource.map((r) => ({
          dataSource: r.dataSource,
          count: r._count._all,
        })),
      },
      matchFacts: {
        rowsWithLineupsJson: matchFactsWithLineups,
        hint: 'lineups 多来自 FD 单场情报同步；可用于核对阵容覆盖度。',
      },
      openFootball: {
        note:
          'football.json 联赛文件仅含赛程与比分，不含大名单；大名单请用本页 FD squad 或规划中的 CSV/爬虫源。',
        defaultJsonProbe: openFootballProbe,
      },
      externalSourcesPlanned: {
        fbref: {
          role: '赛后 xG 等：已支持管理后台 / REST 上传 CSV 合并 profile.fbref（非实时）。',
          profileKey: 'fbref',
          playersWithKey: withFbref,
        },
        understat: {
          role: 'xG/xA；页面结构可爬，延迟高，不适合事件流。',
          profileKey: 'understat',
          playersWithKey: withUnderstat,
        },
        transfermarkt: {
          role: '身价、合同、转会；补充维度，注意站点条款与节流。',
          profileKey: 'transfermarkt',
          playersWithKey: withTransfermarkt,
        },
      },
      recentIngestJobsPlayerRelated: ingestPlayerRelated,
    };
  }
}
