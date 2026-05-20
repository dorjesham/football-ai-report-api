import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { asRecord } from '../api-football/af-fixture-match-fields.util';
import { MatchAfRawBundleService } from './match-af-raw-bundle.service';
import { DisplayNameService } from '../localization/display-name.service';

const MISSING = '暂无官方数据';

@Injectable()
export class MatchLlmBundleInputService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundleSvc: MatchAfRawBundleService,
    private readonly displayName: DisplayNameService,
  ) {}

  async buildForMatch(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { select: { nameCn: true, nameEn: true, externalId: true } },
        awayTeam: { select: { nameCn: true, nameEn: true, externalId: true } },
        competition: {
          select: { nameCn: true, nameEn: true, code: true, apiSportsLeagueId: true },
        },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const bundle = await this.bundleSvc.getByMatchId(matchId);
    const coverage =
      bundle ? this.bundleSvc.buildCoverage(bundle) : {};

    const lineups = Array.isArray(bundle?.lineupsJson) ? bundle.lineupsJson : [];
    const injuries = bundle?.injuriesJson ?? null;
    const predictions = bundle?.predictionsJson ?? null;
    const h2h = bundle?.h2hJson ?? null;

    return {
      matchId,
      kickoffTime: match.kickoffTime.toISOString(),
      status: match.status,
      homeTeam: this.displayName.resolveTeam(match.homeTeam).displayName,
      awayTeam: this.displayName.resolveTeam(match.awayTeam).displayName,
      competition:
        match.competition ?
          this.displayName.resolveCompetition(match.competition).displayName
        : MISSING,
      dataPolicy:
        '仅使用下列 JSON 中已存在的数据进行分析；缺失项必须写明「暂无官方数据」，禁止编造。必须使用输入中的中文队名 displayName；无中文时保留英文，禁止自行编造译名。',
      fixture: bundle?.fixtureJson ?? MISSING,
      injuries: injuries ?? MISSING,
      predictions: predictions ?? MISSING,
      lineups:
        lineups.length > 0 ? lineups : { status: 'empty', note: MISSING },
      h2h: h2h ?? MISSING,
      homeTeamStats: bundle?.homeTeamStatsJson ?? MISSING,
      awayTeamStats: bundle?.awayTeamStatsJson ?? MISSING,
      homeCoach: bundle?.homeCoachJson ?? MISSING,
      awayCoach: bundle?.awayCoachJson ?? MISSING,
      homeSquad: bundle?.homeSquadJson ?? MISSING,
      awaySquad: bundle?.awaySquadJson ?? MISSING,
      events: bundle?.eventsJson ?? MISSING,
      statistics: bundle?.statisticsJson ?? MISSING,
      players: bundle?.playersJson ?? MISSING,
      availability: coverage,
      syncedAt: bundle?.syncedAt?.toISOString() ?? null,
    };
  }

  formatForPrompt(payload: Awaited<ReturnType<MatchLlmBundleInputService['buildForMatch']>>): string {
    const fx = asRecord(
      Array.isArray(payload.fixture) ?
        payload.fixture[0]
      : payload.fixture,
    );
    const league = asRecord(fx?.league);
    const header = [
      `对阵：${payload.homeTeam} vs ${payload.awayTeam}`,
      `赛事：${payload.competition}`,
      `开球：${payload.kickoffTime}`,
      `状态：${payload.status}`,
      league?.name ? `联赛：${league.name}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return `${header}\n\n${payload.dataPolicy}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2).slice(0, 28_000)}\n\`\`\``;
  }
}
