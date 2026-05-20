import { Global, Module } from '@nestjs/common';
import { AdminApiModule } from '../admin-api/admin-api.module';
import { DeepseekModule } from '../deepseek/deepseek.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FootballDictionaryService } from './football-dictionary.service';
import { LocalizationSeedLoader } from './localization-seed.loader';
import { DisplayNameService } from './display-name.service';
import { LocalizationService } from './localization.service';
import { LocalizationSeedService } from './localization-seed.service';
import { LocalizationBackfillService } from './localization-backfill.service';
import { LocalizationPostIngestHook } from './localization-post-ingest.hook';
import { AfTeamOverrideImportService } from './af-team-override-import.service';
import { LocalizationAdminController } from './localization-admin.controller';
import { MatchPresentationEnricherService } from './match-presentation-enricher.service';

@Global()
@Module({
  imports: [PrismaModule, AdminApiModule, DeepseekModule],
  controllers: [LocalizationAdminController],
  providers: [
    FootballDictionaryService,
    LocalizationSeedLoader,
    DisplayNameService,
    MatchPresentationEnricherService,
    LocalizationService,
    LocalizationSeedService,
    LocalizationBackfillService,
    LocalizationPostIngestHook,
    AfTeamOverrideImportService,
  ],
  exports: [
    FootballDictionaryService,
    LocalizationSeedLoader,
    DisplayNameService,
    MatchPresentationEnricherService,
    LocalizationService,
    LocalizationSeedService,
    LocalizationBackfillService,
    LocalizationPostIngestHook,
    AfTeamOverrideImportService,
  ],
})
export class LocalizationModule {}
