import { AiReportType, ReportStatus } from '@prisma/client';
import { PostMatchBootstrapPublishService } from './post-match-bootstrap-publish.service';

describe('PostMatchBootstrapPublishService', () => {
  const prisma = {
    aiReport: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const service = new PostMatchBootstrapPublishService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes draft post-match when safety passes', async () => {
    prisma.aiReport.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'r1',
        disclaimer: '免责声明',
        freeSummary: '赛后摘要',
      });
    prisma.aiReport.update.mockResolvedValue({});

    const out = await service.publishPostMatchForBootstrap('m1');

    expect(out.published).toBe(true);
    expect(prisma.aiReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r1' },
        data: expect.objectContaining({ status: ReportStatus.PUBLISHED }),
      }),
    );
  });

  it('skips when already published', async () => {
    prisma.aiReport.findFirst.mockResolvedValueOnce({ id: 'r0' });

    const out = await service.publishPostMatchForBootstrap('m1');

    expect(out.published).toBe(true);
    expect(out.skipped).toBe('already_visible');
    expect(prisma.aiReport.update).not.toHaveBeenCalled();
  });

  it('skips when no report exists', async () => {
    prisma.aiReport.findFirst.mockResolvedValue(null);

    const out = await service.publishPostMatchForBootstrap('m1');

    expect(out.published).toBe(false);
    expect(out.skipped).toBe('no_report');
  });
});
