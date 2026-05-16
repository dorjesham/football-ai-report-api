import { Module } from '@nestjs/common';
import { AiReportModule } from '../ai-report/ai-report.module';
import { MatchLlmDossierModule } from '../match-llm-dossier/match-llm-dossier.module';
import { TacticsService } from './tactics.service';
import { TacticsController } from './tactics.controller';

@Module({
  imports: [AiReportModule, MatchLlmDossierModule],
  controllers: [TacticsController],
  providers: [TacticsService],
  exports: [TacticsService],
})
export class TacticsModule {}
