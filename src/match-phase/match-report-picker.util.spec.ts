import { AiReportType, ReportStatus } from '@prisma/client';
import { pickPreMatchReport, pickTypedReport } from './match-report-picker.util';

describe('match-report-picker', () => {
  it('pickPreMatchReport prefers draft for admin', () => {
    const reports = [
      {
        id: '1',
        reportType: AiReportType.PRE_MATCH,
        status: ReportStatus.PUBLISHED,
      },
      {
        id: '2',
        reportType: AiReportType.PRE_MATCH,
        status: ReportStatus.DRAFT,
      },
    ] as never[];
    expect(pickPreMatchReport(reports, true)?.id).toBe('2');
    expect(pickPreMatchReport(reports, false)?.id).toBe('1');
  });

  it('pickTypedReport finds POST_MATCH', () => {
    const reports = [
      {
        id: 'x',
        reportType: AiReportType.POST_MATCH,
        status: ReportStatus.PUBLISHED,
      },
    ] as never[];
    expect(pickTypedReport(reports, AiReportType.POST_MATCH, false)?.id).toBe('x');
  });
});
