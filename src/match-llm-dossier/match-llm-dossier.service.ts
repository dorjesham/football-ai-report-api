import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FootballDataService } from '../football-data/football-data.service';
import {
  shouldRunAfMatchFactsSync,
  shouldRunFootballDataIntelSync,
} from '../match-intel-pipeline/match-intel-sync-routing.util';
import { PublicSourcesService } from '../public-sources/public-sources.service';
import {
  LLM_DATA_STEWARD_ADDENDUM,
  LLM_MATCH_REPORT_USER_PREAMBLE,
} from './llm-dossier-policy';
import { extractAfTeamComparison } from '../match-af-raw-bundle/af-predictions-comparison.util';
import { DisplayNameService } from '../localization/display-name.service';
import type { DataAvailabilityStatus, MatchLlmDossier } from './match-llm-dossier.types';

const EXCERPT_LEN = 480;

function excerpt(text: string | null | undefined, n = EXCERPT_LEN): string {
  if (!text?.trim()) return '';
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function snapStatus(
  row: Record<string, unknown> | null | undefined,
): DataAvailabilityStatus {
  if (!row) return 'missing';
  const att = row.attackRating;
  const def = row.defenseRating;
  const hasRatings =
    att != null && def != null && typeof att === 'number' && typeof def === 'number';
  const rf = row.recentForm;
  const gf = row.goalsForAvg;
  const ga = row.goalsAgainstAvg;
  const xg = row.xgAvg ?? row.xgaAvg;
  if (!hasRatings) {
    if (
      (typeof rf === 'string' && rf.length > 0) ||
      gf != null ||
      ga != null ||
      xg != null
    ) {
      return 'partial';
    }
    return 'partial';
  }
  if ((typeof rf === 'string' && rf.length > 0) || gf != null || ga != null || xg != null) {
    if (typeof rf === 'string' && rf.length >= 3 && (gf != null || ga != null)) return 'present';
    return 'partial';
  }
  return 'present';
}

@Injectable()
export class MatchLlmDossierService {
  private readonly log = new Logger(MatchLlmDossierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly footballData: FootballDataService,
    private readonly publicSources: PublicSourcesService,
    private readonly displayName: DisplayNameService,
  ) {}

  /**
   * 第一步：尽量 FD 单场 intel；第二步：公开来源抓取；第三步：从库组装分层档案与 dataAvailability。
   */
  async prepareEnrichedDossier(
    matchId: string,
    opts?: { skipFdIntel?: boolean; skipPublicFetch?: boolean; publicFetchForce?: boolean },
  ): Promise<MatchLlmDossier> {
    const warnings: string[] = [];
    if (!opts?.skipFdIntel) {
      try {
        const row = await this.prisma.match.findUnique({
          where: { id: matchId },
          select: { externalId: true, dataSource: true },
        });
        if (row && shouldRunAfMatchFactsSync(row)) {
          await this.footballData.syncMatchAfFactsFromApiFootball(matchId);
        } else if (row && shouldRunFootballDataIntelSync(row)) {
          await this.footballData.syncMatchIntelFromFootballData(matchId);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`单场情报同步未完全成功（仍使用库内已有数据）: ${msg.slice(0, 400)}`);
        this.log.warn(`[dossier] match intel: ${msg}`);
      }
    }
    if (!opts?.skipPublicFetch) {
      try {
        await this.publicSources.fetchForMatch(matchId, {
          force: opts?.publicFetchForce === true,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`公开来源抓取未完全成功: ${msg.slice(0, 400)}`);
        this.log.warn(`[dossier] public fetch: ${msg}`);
      }
    }
    const dossier = await this.buildDossier(matchId);
    return { ...dossier, preparationWarnings: [...warnings, ...dossier.preparationWarnings] };
  }

  /** 仅从当前库组装（不访问外网），供战术等轻量调用。 */
  async buildDossier(matchId: string): Promise<MatchLlmDossier> {
    const m = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        competition: true,
        tournament: true,
        season: true,
        homeTeam: true,
        awayTeam: true,
        teamSnapshots: { include: { team: true } },
        playerSnapshots: { include: { player: true } },
        activePrediction: true,
        refereeSnapshot: { include: { referee: true } },
        weatherSnapshot: true,
        headToHead: true,
        playerIntelligence: { include: { player: true }, take: 24 },
        sourceRecords: { orderBy: { fetchedAt: 'desc' }, take: 28 },
      },
    });
    if (!m) throw new NotFoundException('Match not found');

    const bundle = await this.prisma.matchAfRawBundle.findUnique({
      where: { matchId },
      select: { predictionsJson: true },
    });
    const afTeamComparison = extractAfTeamComparison(bundle?.predictionsJson ?? null);

    const homeSnap = m.teamSnapshots.find((s) => s.isHome);
    const awaySnap = m.teamSnapshots.find((s) => !s.isHome);

    const fdExt: DataAvailabilityStatus = m.externalId ? 'present' : 'missing';
    const fdBasics: DataAvailabilityStatus =
      m.externalId && (m.stadium != null || m.homeScore != null || m.awayScore != null)
        ? 'present'
        : m.externalId
          ? 'partial'
          : 'missing';

    const teamH = homeSnap ? snapStatus(homeSnap as unknown as Record<string, unknown>) : 'missing';
    const teamA = awaySnap ? snapStatus(awaySnap as unknown as Record<string, unknown>) : 'missing';
    const teamSnapsOverall: DataAvailabilityStatus =
      teamH === 'missing' && teamA === 'missing'
        ? 'missing'
        : teamH === 'present' && teamA === 'present'
          ? 'present'
          : 'partial';

    const pred: DataAvailabilityStatus = m.activePrediction ? 'present' : 'missing';
    const wx = m.weatherSnapshot;
    const weather: DataAvailabilityStatus =
      wx && (wx.condition != null || wx.temperature != null) ? 'present' : wx ? 'partial' : 'missing';
    const ref: DataAvailabilityStatus = m.refereeSnapshot?.referee ? 'present' : 'missing';
    const h2hRow = m.headToHead;
    let h2h: DataAvailabilityStatus = 'missing';
    if (h2hRow) {
      const n = h2hRow.lastMeetingsCount ?? 0;
      if (n > 0) h2h = 'present';
      else if ((h2hRow.summary?.length ?? 0) > 20) h2h = 'partial';
      else h2h = 'partial';
    }
    const ps = m.playerSnapshots.length;
    const pi = m.playerIntelligence.length;
    const playerSnaps: DataAvailabilityStatus = ps > 0 ? 'present' : 'missing';
    const playerIntel: DataAvailabilityStatus = pi > 0 ? (pi >= 4 ? 'present' : 'partial') : 'missing';

    const src = m.sourceRecords;
    let pub: DataAvailabilityStatus = 'missing';
    if (src.length >= 3) pub = 'present';
    else if (src.length > 0) pub = 'partial';

    const dataAvailability: Record<string, DataAvailabilityStatus> = {
      'footballData.externalId': fdExt,
      'footballData.matchBasics': fdBasics,
      'database.teamSnapshots': teamSnapsOverall,
      'database.prediction': pred,
      'database.weather': weather,
      'database.referee': ref,
      'database.headToHead': h2h,
      'database.playerSnapshots': playerSnaps,
      'database.playerIntelligence': playerIntel,
      'publicSources.scrapes': pub,
      'apiFootball.teamComparison': afTeamComparison.available ? 'present' : 'missing',
    };

    const publicSourceDigests = src.map((r) => ({
      sourceType: String(r.sourceType),
      sourceName: r.sourceName,
      sourceUrl: r.sourceUrl,
      title: r.title,
      excerpt: excerpt(r.content),
      fetchedAt: r.fetchedAt.toISOString(),
    }));

    const snapToObj = (s: typeof homeSnap) =>
      s
        ? ({
            isHome: s.isHome,
            leagueRank: s.leagueRank,
            points: s.points,
            recentForm: s.recentForm,
            goalsForAvg: s.goalsForAvg,
            goalsAgainstAvg: s.goalsAgainstAvg,
            xgAvg: s.xgAvg,
            xgaAvg: s.xgaAvg,
            attackRating: s.attackRating,
            defenseRating: s.defenseRating,
            formation: s.formation,
            coachName: s.coachName,
            coachStyle: s.coachStyle,
            dataSource: s.dataSource,
            dataQuality: s.dataQuality,
          } as Record<string, unknown>)
        : null;

    const homeDn = this.displayName.resolveTeam(m.homeTeam);
    const awayDn = this.displayName.resolveTeam(m.awayTeam);
    const compDn = m.competition ? this.displayName.resolveCompetition(m.competition) : null;

    const layers: MatchLlmDossier['layers'] = {
      footballData: {
        externalId: m.externalId,
        status: m.status,
        kickoffTime: m.kickoffTime.toISOString(),
        stadium: m.stadium,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        competitionCode: m.competition?.code ?? null,
        competitionNameCn: compDn?.displayName ?? m.competition?.nameCn ?? null,
        round: m.round,
      },
      teams: {
        home: {
          id: m.homeTeam.id,
          nameCn: m.homeTeam.nameCn,
          nameEn: m.homeTeam.nameEn,
          displayName: homeDn.displayName,
          translationStatus: homeDn.translationStatus,
        },
        away: {
          id: m.awayTeam.id,
          nameCn: m.awayTeam.nameCn,
          nameEn: m.awayTeam.nameEn,
          displayName: awayDn.displayName,
          translationStatus: awayDn.translationStatus,
        },
      },
      afTeamComparison,
      teamSnapshots: {
        home: snapToObj(homeSnap),
        away: snapToObj(awaySnap),
      },
      prediction: m.activePrediction
        ? (JSON.parse(JSON.stringify(m.activePrediction)) as Record<string, unknown>)
        : null,
      weather: m.weatherSnapshot
        ? (JSON.parse(JSON.stringify(m.weatherSnapshot)) as Record<string, unknown>)
        : null,
      referee: m.refereeSnapshot
        ? (JSON.parse(JSON.stringify(m.refereeSnapshot)) as Record<string, unknown>)
        : null,
      headToHead: m.headToHead
        ? (JSON.parse(JSON.stringify(m.headToHead)) as Record<string, unknown>)
        : null,
      playerSnapshotsCount: ps,
      playerIntelligenceCount: pi,
      publicSourceDigests,
    };

    return {
      matchId,
      builtAt: new Date().toISOString(),
      dataAvailability,
      preparationWarnings: [],
      layers,
    };
  }

  /** 供 user 消息拼接：可读块 + JSON（控制长度）。 */
  formatForMatchReportPrompt(dossier: MatchLlmDossier, maxChars = 14_000): string {
    const header = `${LLM_MATCH_REPORT_USER_PREAMBLE}\n\n【dataAvailability】\n${JSON.stringify(dossier.dataAvailability, null, 2)}`;
    const warns =
      dossier.preparationWarnings.length > 0
        ? `\n【准备阶段提示】\n${dossier.preparationWarnings.map((w) => `- ${w}`).join('\n')}`
        : '';
    const tail = `\n\n请输出赛前 AI 情报报告 JSON（与系统 role 要求一致）。`;
    const notice =
      '\n...(layers JSON 已截断：仅依据上文 dataAvailability 与可见片段作答，勿编造被截断处细节)';
    const prefix = `${header}${warns}`;
    const room = Math.max(0, maxChars - prefix.length - tail.length);
    let body = `\n【layers JSON】\n${JSON.stringify(dossier.layers, null, 2)}`;
    if (body.length > room) {
      body = `\n【layers JSON】\n${JSON.stringify(dossier.layers)}`;
    }
    if (body.length > room) {
      const cap = Math.max(0, room - notice.length - 1);
      body = `\n【layers JSON】\n${JSON.stringify(dossier.layers).slice(0, cap)}${notice}`;
    }
    return `${prefix}${body}${tail}`;
  }

  /** 战术等模块用的短块：策略 + 可用性 + 摘要。 */
  formatCompactForPrompt(dossier: MatchLlmDossier): string {
    const lines = [
      LLM_DATA_STEWARD_ADDENDUM,
      '',
      '【dataAvailability】',
      JSON.stringify(dossier.dataAvailability, null, 2),
      '',
      '【比赛要点】',
      `${dossier.layers.teams.home.displayName} vs ${dossier.layers.teams.away.displayName}；开球 ${dossier.layers.footballData.kickoffTime}；FD externalId=${dossier.layers.footballData.externalId ?? '无'}；赛况 ${dossier.layers.footballData.status}`,
      '',
      '【公开来源摘录（最多6条）】',
      ...dossier.layers.publicSourceDigests.slice(0, 6).map(
        (s, i) =>
          `${i + 1}. [${s.sourceType}] ${s.title ?? s.sourceName}${s.sourceUrl ? ` ${s.sourceUrl}` : ''}\n   ${s.excerpt || '(无正文)'}`,
      ),
    ];
    if (dossier.preparationWarnings.length) {
      lines.push('', '【准备阶段提示】', ...dossier.preparationWarnings.map((w) => `- ${w}`));
    }
    return lines.join('\n');
  }
}
