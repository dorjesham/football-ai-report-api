import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocalizationSeedService } from './localization-seed.service';
import { LocalizationService } from './localization.service';
import type { EntityType } from './localization.types';
import { parseAfPlayerId, parseAfTeamId } from './referee-name.util';

export type BackfillParams = {
  entityTypes?: EntityType[];
  competitionCodes?: string[];
  onlyMissing?: boolean;
  applyDraft?: boolean;
  dryRun?: boolean;
};

@Injectable()
export class LocalizationBackfillService {
  private readonly log = new Logger(LocalizationBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly seed: LocalizationSeedService,
    private readonly l10n: LocalizationService,
  ) {}

  async run(params: BackfillParams = {}): Promise<Record<string, unknown>> {
    const types = params.entityTypes ?? ['competition', 'team', 'player'];
    const summary: Record<string, unknown> = { dryRun: !!params.dryRun };

    if (!params.dryRun) {
      summary.seedFiles = await this.seed.applyFromDirectory();
    }

    const { teamWhere, playerWhere } = this.buildFilters(params.competitionCodes);

    if (types.includes('team')) {
      const teams = await this.prisma.team.findMany({
        where: teamWhere,
        select: {
          id: true,
          nameEn: true,
          nameCn: true,
          externalId: true,
          apiFootballTeamId: true,
        },
      });
      let applied = 0;
      for (const t of teams) {
        if (params.onlyMissing && t.nameCn.trim() !== t.nameEn.trim()) continue;
        if (!params.dryRun) await this.l10n.onTeamUpsert(t);
        applied++;
      }
      summary.teams = { scanned: teams.length, applied };
    }

    if (types.includes('player')) {
      const players = await this.prisma.player.findMany({
        where: playerWhere,
        select: { id: true, nameEn: true, nameCn: true, externalId: true },
        take: 10_000,
      });
      let applied = 0;
      for (const p of players) {
        if (params.onlyMissing && p.nameCn.trim() !== p.nameEn.trim()) continue;
        if (!params.dryRun) await this.l10n.onPlayerUpsert(p);
        applied++;
      }
      summary.players = { scanned: players.length, applied };
    }

    summary.coverage = await this.l10n.getCoverage(
      params.competitionCodes?.[0] ? { competitionCode: params.competitionCodes[0] } : undefined,
    );
    this.log.log(`Backfill done: ${JSON.stringify(summary)}`);
    return summary;
  }

  private buildFilters(codes?: string[]) {
    if (!codes?.length) return { teamWhere: {}, playerWhere: {} };
    const teamWhere = {
      OR: [
        { homeMatches: { some: { competition: { code: { in: codes } } } } },
        { awayMatches: { some: { competition: { code: { in: codes } } } } },
      ],
    };
    return { teamWhere, playerWhere: { team: teamWhere } };
  }
}
