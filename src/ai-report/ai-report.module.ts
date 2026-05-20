import { Module, forwardRef } from '@nestjs/common';
import { DeepseekModule } from '../deepseek/deepseek.module';
import { MatchLiveModule } from '../match-live/match-live.module';
import { MatchAfRawBundleModule } from '../match-af-raw-bundle/match-af-raw-bundle.module';
import { MatchLlmDossierModule } from '../match-llm-dossier/match-llm-dossier.module';
import { AiReportReviewService } from './ai-report-review.service';
import { AiReportService } from './ai-report.service';
import { AiReportController } from './ai-report.controller';
import { AutoAiReportBatchService } from './auto-ai-report-batch.service';
import { AutoPostMatchReportBatchService } from './auto-post-match-report-batch.service';
import { LiveNarrativeReportService } from './live-narrative-report.service';
import { AiReportPublishService } from './ai-report-publish.service';
import { PostMatchBootstrapPublishService } from './post-match-bootstrap-publish.service';
import { PostMatchReportService } from './post-match-report.service';
import { PreMatchIntelLongService } from './pre-match-intel-long.service';
import { PostMatchTacticalLongService } from './post-match-tactical-long.service';
import { ReportFactCheckService } from './report-fact-check.service';
import { WorldCupModule } from '../world-cup/world-cup.module';
import { MatchIntelModule } from '../match-intel/match-intel.module';

@Module({
  imports: [
    DeepseekModule,
    MatchAfRawBundleModule,
    MatchLlmDossierModule,
    forwardRef(() => WorldCupModule),
    MatchIntelModule,
    forwardRef(() => MatchLiveModule),
  ],
  controllers: [AiReportController],
  providers: [
    AiReportService,
    AutoAiReportBatchService,
    AutoPostMatchReportBatchService,
    PostMatchReportService,
    PreMatchIntelLongService,
    PostMatchTacticalLongService,
    AiReportPublishService,
    PostMatchBootstrapPublishService,
    LiveNarrativeReportService,
    ReportFactCheckService,
    AiReportReviewService,
  ],
  exports: [
    DeepseekModule,
    AiReportService,
    AutoAiReportBatchService,
    AutoPostMatchReportBatchService,
    PostMatchReportService,
    PreMatchIntelLongService,
    PostMatchTacticalLongService,
    AiReportPublishService,
    PostMatchBootstrapPublishService,
    LiveNarrativeReportService,
    AiReportReviewService,
    ReportFactCheckService,
  ],
})
export class AiReportModule {}
