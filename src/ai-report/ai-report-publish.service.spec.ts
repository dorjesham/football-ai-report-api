import { AiReportType, ReportStatus } from '@prisma/client';
import { AiReportPublishService } from './ai-report-publish.service';

describe('AiReportPublishService', () => {
  const tx = {
    aiReport: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const prisma = {
    aiReport: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const svc = new AiReportPublishService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('archives prior PUBLISHED and sets publishedKey on publish', async () => {
    prisma.aiReport.findUnique.mockResolvedValue({
      id: 'r1',
      matchId: 'm1',
      reportType: AiReportType.PRE_MATCH,
      disclaimer: '免责声明',
      freeSummary: '这是一段足够长的赛前分析摘要，用于通过发布前校验。',
      status: ReportStatus.DRAFT,
    });

    const out = await svc.publishById('r1');
    expect(out.published).toBe(true);
    expect(tx.aiReport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          matchId: 'm1',
          reportType: AiReportType.PRE_MATCH,
          status: ReportStatus.PUBLISHED,
        }),
        data: expect.objectContaining({
          status: ReportStatus.ARCHIVED,
          publishedKey: null,
        }),
      }),
    );
    expect(tx.aiReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r1' },
        data: expect.objectContaining({
          status: ReportStatus.PUBLISHED,
          publishedKey: 'm1:PRE_MATCH',
        }),
      }),
    );
  });
});
