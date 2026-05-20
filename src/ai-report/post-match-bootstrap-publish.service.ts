import { Injectable } from '@nestjs/common';
import {
  AiReportPublishService,
  type PublishAiReportResult,
} from './ai-report-publish.service';

export type PublishPostMatchResult = PublishAiReportResult;

@Injectable()
export class PostMatchBootstrapPublishService {
  constructor(private readonly publish: AiReportPublishService) {}

  publishPostMatchForBootstrap(matchId: string): Promise<PublishPostMatchResult> {
    return this.publish.publishPostMatchForBootstrap(matchId);
  }
}
