import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocalizationService } from './localization.service';

@Injectable()
export class AfTeamOverrideImportService {
  private readonly log = new Logger(AfTeamOverrideImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly l10n: LocalizationService,
  ) {}

  async importAll(): Promise<{ imported: number }> {
    const rows = await this.prisma.afTeamNameOverride.findMany();
    let imported = 0;
    for (const o of rows) {
      const team = await this.prisma.team.findFirst({
        where: { apiFootballTeamId: o.apiFootballTeamId },
      });
      await this.l10n.upsertTranslation({
        entityType: 'team',
        entityId: team?.id ?? null,
        externalId: String(o.apiFootballTeamId),
        sourceText: team?.nameEn ?? null,
        translatedText: o.nameCn,
        source: 'import',
        status: 'approved',
        locked: false,
      });
      if (team) {
        await this.prisma.team.update({
          where: { id: team.id },
          data: { nameCn: o.nameCn },
        });
      }
      imported++;
    }
    this.log.log(`Imported ${imported} AfTeamNameOverride rows`);
    return { imported };
  }
}
