import { ReportStatus, UserRole, AiReportType } from '@prisma/client';
import { AiReportReviewService } from './ai-report-review.service';

describe('AiReportReviewService state', () => {
  it('submitForReview moves to REVIEW when fact check passes', async () => {
    const report = {
      id: 'r1',
      matchId: 'm1',
      status: ReportStatus.DRAFT,
      reportType: AiReportType.POST_MATCH,
      contentWarnings: null,
      disclaimer: '免责声明足够长'.repeat(5),
      freeSummary: '复盘正文',
    };
    const prisma = {
      aiReport: {
        findFirst: jest.fn().mockResolvedValue(report),
        update: jest.fn().mockImplementation(({ data }) => ({ ...report, ...data })),
      },
    };
    const factCheck = {
      checkReport: jest.fn().mockResolvedValue({ pass: true, checkedAt: '', errors: [] }),
    };
    const svc = new AiReportReviewService(prisma as never, factCheck as never);
    const out = await svc.submitForReview('m1', 'r1');
    expect(out.status).toBe(ReportStatus.REVIEW);
  });
});
