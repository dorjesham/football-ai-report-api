import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { resolveLocalizationDataDir } from './localization-path.util';
import { LocalizationService } from './localization.service';
import type { SeedEntry } from './localization.types';
import { parseAfPlayerId, parseAfTeamId } from './referee-name.util';

@Injectable()
export class LocalizationSeedService {
  private readonly log = new Logger(LocalizationSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly l10n: LocalizationService,
  ) {}

  async applyFromDirectory(dir?: string): Promise<Record<string, number>> {
    const root = dir ?? resolveLocalizationDataDir();
    const stats: Record<string, number> = {};
    const files = readdirSync(root).filter((f) => f.endsWith('.json') && f !== 'football-dictionaries.json');
    for (const file of files) {
      const n = await this.applyFile(join(root, file));
      stats[file] = n;
    }
    this.log.log(`Seed apply: ${JSON.stringify(stats)}`);
    return stats;
  }

  private async applyFile(path: string): Promise<number> {
    const base = path.split('/').pop() ?? '';
    let rows: SeedEntry[];
    try {
      rows = JSON.parse(readFileSync(path, 'utf8')) as SeedEntry[];
    } catch {
      return 0;
    }
    if (!Array.isArray(rows)) return 0;
    let n = 0;
    for (const entry of rows) {
      if (!entry?.nameCn) continue;
      if (base.startsWith('teams.')) {
        const afId = entry.externalId ? Number(entry.externalId) : NaN;
        const team = await this.findTeamByAfId(afId, entry.nameEn);
        await this.l10n.applySeedEntry('team', entry, team?.id);
        n++;
      } else if (base === 'competitions.json') {
        const comp = await this.findCompetition(entry);
        await this.l10n.applySeedEntry('competition', entry, comp?.id);
        n++;
      } else if (base.startsWith('players.')) {
        const afId = entry.externalId ? Number(entry.externalId) : NaN;
        const player = await this.prisma.player.findFirst({
          where: entry.externalId ? { externalId: `af-p-${entry.externalId}` } : { nameEn: entry.nameEn },
        });
        await this.l10n.applySeedEntry('player', entry, player?.id);
        n++;
      } else if (base === 'referees.json' || base === 'coaches.json') {
        await this.l10n.applySeedEntry(base === 'referees.json' ? 'referee' : 'coach', entry);
        n++;
      }
    }
    return n;
  }

  private async findTeamByAfId(afId: number, nameEn?: string) {
    if (Number.isFinite(afId)) {
      const t = await this.prisma.team.findFirst({
        where: { OR: [{ apiFootballTeamId: afId }, { externalId: `af-t-${afId}` }] },
      });
      if (t) return t;
    }
    if (nameEn) {
      return this.prisma.team.findFirst({ where: { nameEn } });
    }
    return null;
  }

  private async findCompetition(entry: SeedEntry) {
    if (entry.externalId) {
      const id = Number(entry.externalId);
      if (Number.isFinite(id)) {
        const c = await this.prisma.competition.findFirst({
          where: { apiSportsLeagueId: id },
        });
        if (c) return c;
      }
    }
    if (entry.code) {
      return this.prisma.competition.findFirst({ where: { code: entry.code } });
    }
    return null;
  }
}
