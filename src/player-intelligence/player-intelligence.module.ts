import { Module } from '@nestjs/common';
import { AiReportModule } from '../ai-report/ai-report.module';
import { MatchLlmDossierModule } from '../match-llm-dossier/match-llm-dossier.module';
import { PlayerIntelligenceService } from './player-intelligence.service';
import { PlayerIntelligenceController } from './player-intelligence.controller';

@Module({
  imports: [AiReportModule, MatchLlmDossierModule],
  controllers: [PlayerIntelligenceController],
  providers: [PlayerIntelligenceService],
  exports: [PlayerIntelligenceService],
})
export class PlayerIntelligenceModule {}
