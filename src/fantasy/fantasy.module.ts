import { Module } from '@nestjs/common';
import { AiReportModule } from '../ai-report/ai-report.module';
import { MatchLlmDossierModule } from '../match-llm-dossier/match-llm-dossier.module';
import { FantasyService } from './fantasy.service';
import { FantasyController } from './fantasy.controller';

@Module({
  imports: [AiReportModule, MatchLlmDossierModule],
  controllers: [FantasyController],
  providers: [FantasyService],
  exports: [FantasyService],
})
export class FantasyModule {}
