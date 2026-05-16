import { Module } from '@nestjs/common';
import { FootballDataModule } from '../football-data/football-data.module';
import { PublicSourcesModule } from '../public-sources/public-sources.module';
import { MatchLlmDossierService } from './match-llm-dossier.service';

@Module({
  imports: [FootballDataModule, PublicSourcesModule],
  providers: [MatchLlmDossierService],
  exports: [MatchLlmDossierService],
})
export class MatchLlmDossierModule {}
