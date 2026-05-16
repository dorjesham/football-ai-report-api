import { AiReport, AiReportType, ReportStatus } from '@prisma/client';

export function pickPreMatchReport(
  reports: AiReport[],
  isAdmin: boolean,
): AiReport | undefined {
  const pre = reports.filter(
    (r) => r.reportType === AiReportType.PRE_MATCH || r.reportType == null,
  );
  const published = pre.find((r) => r.status === ReportStatus.PUBLISHED);
  const review = pre.find((r) => r.status === ReportStatus.REVIEW);
  const draft = pre.find((r) => r.status === ReportStatus.DRAFT);
  if (isAdmin) return draft ?? review ?? published;
  return published;
}

export function pickTypedReport(
  reports: AiReport[],
  type: AiReportType,
  isAdmin: boolean,
): AiReport | undefined {
  const typed = reports.filter((r) => r.reportType === type);
  const published = typed.find((r) => r.status === ReportStatus.PUBLISHED);
  const review = typed.find((r) => r.status === ReportStatus.REVIEW);
  const draft = typed.find((r) => r.status === ReportStatus.DRAFT);
  if (isAdmin) return draft ?? review ?? published;
  return published;
}
