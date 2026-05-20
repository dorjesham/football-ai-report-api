import { AiReportType, ReportStatus } from '@prisma/client';
import {
  upsertPostMatchDraft,
  upsertPreMatchDraft,
} from './ai-report-draft-persistence.util';

type AiReportRow = {
  id: string;
  matchId: string;
  reportType: AiReportType;
  inputHash: string | null;
  status: ReportStatus;
  freeSummary: string;
  publishedKey: string | null;
  publishedAt: Date | null;
};

function mockPrisma(initial: {
  reports?: AiReportRow[];
  matchReportStatus?: ReportStatus;
}) {
  const reports = [...(initial.reports ?? [])];
  let matchStatus = initial.matchReportStatus ?? ReportStatus.NONE;

  return {
    aiReport: {
      findUnique: jest.fn(async ({ where }: { where: { matchId_reportType_inputHash: { matchId: string; reportType: AiReportType; inputHash: string } } }) => {
        const k = where.matchId_reportType_inputHash;
        return (
          reports.find(
            (r) =>
              r.matchId === k.matchId &&
              r.reportType === k.reportType &&
              r.inputHash === k.inputHash,
          ) ?? null
        );
      }),
      findFirst: jest.fn(async ({ where }: { where: { matchId: string; reportType: AiReportType; status?: { in: ReportStatus[] } } }) => {
        const filtered = reports.filter(
          (r) =>
            r.matchId === where.matchId &&
            r.reportType === where.reportType &&
            (!where.status?.in || where.status.in.includes(r.status)),
        );
        return filtered.sort((a, b) => b.id.localeCompare(a.id))[0] ?? null;
      }),
      create: jest.fn(async ({ data }: { data: Partial<AiReportRow> }) => {
        const row: AiReportRow = {
          id: `r-${reports.length + 1}`,
          matchId: data.matchId!,
          reportType: data.reportType!,
          inputHash: (data.inputHash as string) ?? null,
          status: (data.status as ReportStatus) ?? ReportStatus.DRAFT,
          freeSummary: data.freeSummary as string,
          publishedKey: null,
          publishedAt: null,
        };
        reports.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<AiReportRow> }) => {
        const idx = reports.findIndex((r) => r.id === where.id);
        if (idx < 0) throw new Error('not found');
        reports[idx] = { ...reports[idx], ...data };
        return reports[idx];
      }),
    },
    match: {
      update: jest.fn(async ({ data }: { data: { reportStatus: ReportStatus } }) => {
        matchStatus = data.reportStatus;
        return { reportStatus: matchStatus };
      }),
    },
    _reports: reports,
    _matchStatus: () => matchStatus,
  };
}

describe('upsertPreMatchDraft', () => {
  const baseData = {
    matchId: 'm1',
    freeSummary: 'summary v2',
    disclaimer: '免责声明',
  };

  it('updates existing DRAFT instead of creating duplicate', async () => {
    const prisma = mockPrisma({
      reports: [
        {
          id: 'r1',
          matchId: 'm1',
          reportType: AiReportType.PRE_MATCH,
          inputHash: 'hash-a',
          status: ReportStatus.DRAFT,
          freeSummary: 'old',
          publishedKey: null,
          publishedAt: null,
        },
      ],
    });

    const { report, reused } = await upsertPreMatchDraft(prisma as never, {
      matchId: 'm1',
      inputHash: 'hash-a',
      mode: 'forceRegenerate',
      data: baseData,
    });

    expect(reused).toBe(true);
    expect(report.freeSummary).toBe('summary v2');
    expect(prisma.aiReport.create).not.toHaveBeenCalled();
    expect(prisma._reports).toHaveLength(1);
  });

  it('demotes PUBLISHED to DRAFT on forceRegenerate', async () => {
    const prisma = mockPrisma({
      reports: [
        {
          id: 'r1',
          matchId: 'm1',
          reportType: AiReportType.PRE_MATCH,
          inputHash: 'hash-a',
          status: ReportStatus.PUBLISHED,
          freeSummary: 'pub',
          publishedKey: 'm1:PRE_MATCH',
          publishedAt: new Date(),
        },
      ],
      matchReportStatus: ReportStatus.PUBLISHED,
    });

    const { report, reused } = await upsertPreMatchDraft(prisma as never, {
      matchId: 'm1',
      inputHash: 'hash-a',
      mode: 'forceRegenerate',
      data: baseData,
    });

    expect(reused).toBe(true);
    expect(report.status).toBe(ReportStatus.DRAFT);
    expect(report.publishedKey).toBeNull();
    expect(prisma._matchStatus()).toBe(ReportStatus.DRAFT);
  });
});

describe('upsertPostMatchDraft', () => {
  it('updates latest post-match draft when present', async () => {
    const prisma = mockPrisma({
      reports: [
        {
          id: 'pm1',
          matchId: 'm2',
          reportType: AiReportType.POST_MATCH,
          inputHash: null,
          status: ReportStatus.DRAFT,
          freeSummary: 'old pm',
          publishedKey: null,
          publishedAt: null,
        },
      ],
    });

    const { reused } = await upsertPostMatchDraft(prisma as never, {
      matchId: 'm2',
      freeSummary: 'new pm',
      disclaimer: 'd',
    });

    expect(reused).toBe(true);
    expect(prisma._reports[0].freeSummary).toBe('new pm');
    expect(prisma.aiReport.create).not.toHaveBeenCalled();
  });
});
