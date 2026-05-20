import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminAuditService } from '../admin-api/admin-audit.service';
import { AfTeamOverrideImportService } from './af-team-override-import.service';
import { LocalizationBackfillService } from './localization-backfill.service';
import { LocalizationSeedService } from './localization-seed.service';
import { LocalizationService } from './localization.service';
import type { BackfillParams } from './localization-backfill.service';

@Controller('admin/api/localization')
@UseGuards(AdminGuard)
export class LocalizationAdminController {
  constructor(
    private readonly l10n: LocalizationService,
    private readonly seed: LocalizationSeedService,
    private readonly backfill: LocalizationBackfillService,
    private readonly overrideImport: AfTeamOverrideImportService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get('overview')
  async overview(@Query('competitionCode') competitionCode?: string) {
    return this.l10n.getCoverage(competitionCode ? { competitionCode } : undefined);
  }

  @Get('translations')
  listTranslations(
    @Query('entityType') entityType?: string,
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.l10n.listTranslations({
      entityType,
      status,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Post('translations')
  async upsertTranslation(
    @Body()
    body: {
      entityType: string;
      entityId?: string;
      externalId?: string;
      sourceText?: string;
      translatedText: string;
      shortText?: string;
      source?: string;
      status?: string;
      locked?: boolean;
    },
  ) {
    const row = await this.l10n.upsertTranslation({
      entityType: body.entityType as 'team',
      entityId: body.entityId,
      externalId: body.externalId,
      sourceText: body.sourceText,
      translatedText: body.translatedText,
      shortText: body.shortText,
      source: body.source ?? 'admin',
      status: body.status ?? 'draft',
      locked: body.locked,
      updatedBy: 'admin',
    });
    await this.audit.log({
      action: 'wc_zh_translation_upsert',
      targetType: 'EntityTranslation',
      targetId: row.id,
      afterJson: row as object,
    });
    return row;
  }

  @Post('translations/:id/approve')
  async approve(@Param('id') id: string) {
    const row = await this.l10n.approve(id, 'admin');
    await this.audit.log({
      action: 'wc_zh_translation_approve',
      targetType: 'EntityTranslation',
      targetId: id,
    });
    return row;
  }

  @Post('translations/:id/reject')
  async reject(@Param('id') id: string) {
    const row = await this.l10n.reject(id);
    await this.audit.log({
      action: 'wc_zh_translation_reject',
      targetType: 'EntityTranslation',
      targetId: id,
    });
    return row;
  }

  @Post('seed/apply')
  async applySeed() {
    const stats = await this.seed.applyFromDirectory();
    await this.audit.log({ action: 'wc_zh_seed_apply', targetType: 'Localization' });
    return { ok: true, stats };
  }

  @Post('backfill')
  async runBackfill(@Body() body: BackfillParams) {
    const summary = await this.backfill.run(body);
    await this.audit.log({
      action: 'wc_zh_backfill',
      targetType: 'Localization',
      afterJson: summary,
    });
    return { ok: true, summary };
  }

  @Post('override-import')
  async importOverrides() {
    const result = await this.overrideImport.importAll();
    await this.audit.log({ action: 'wc_zh_override_import', afterJson: result });
    return result;
  }

  @Post('llm-draft')
  async llmDraft(@Body() body: { entityTypes?: string[]; limit?: number }) {
    return this.l10n.generateLlmDraftBatch({
      entityTypes: body.entityTypes as ('team' | 'player')[] | undefined,
      limit: body.limit,
    });
  }

  @Get('translations/missing')
  missing(
    @Query('entityType') entityType: string,
    @Query('limit') limit?: string,
  ) {
    const et =
      entityType === 'player' ? 'player'
      : entityType === 'competition' ? 'competition'
      : 'team';
    return this.l10n.getMissing(et, limit ? Number(limit) : 100);
  }

  @Post('import')
  async importCsv(@Body() body: { csv: string }) {
    const result = await this.l10n.importTranslationsCsv(body.csv ?? '');
    await this.audit.log({
      action: 'wc_zh_csv_import',
      targetType: 'Localization',
      afterJson: result,
    });
    return result;
  }

  @Get('search')
  search(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.l10n.searchEntities(q ?? '', limit ? Number(limit) : 20);
  }

  @Get('export.csv')
  async exportCsv() {
    const csv = await this.l10n.exportTranslationsCsv();
    return { csv };
  }
}
