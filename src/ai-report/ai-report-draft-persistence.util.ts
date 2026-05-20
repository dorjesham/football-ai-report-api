import {
  AiReportType,
  Prisma,
  PrismaClient,
  ReportStatus,
} from '@prisma/client';

export type AiReportDraftPersistenceMode = 'generate' | 'forceRegenerate';

export type UpsertPreMatchDraftResult = {
  report: Prisma.AiReportGetPayload<Record<string, never>>;
  reused: boolean;
};

type PreMatchDraftData = Omit<
  Prisma.AiReportCreateInput,
  'match' | 'prediction' | 'oddsSnapshot'
> & {
  matchId: string;
  predictionId?: string | null;
  oddsSnapshotId?: string | null;
};

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

function preMatchDraftUpdateData(
  data: PreMatchDraftData,
): Prisma.AiReportUncheckedUpdateInput {
  return {
    predictionId: data.predictionId ?? undefined,
    oddsSnapshotId: data.oddsSnapshotId ?? undefined,
    freeSummary: data.freeSummary,
    dashboardSummary: data.dashboardSummary ?? undefined,
    refereeAnalysis: data.refereeAnalysis ?? undefined,
    weatherAnalysis: data.weatherAnalysis ?? undefined,
    playerProfiles: data.playerProfiles ?? undefined,
    tacticalScenarios: data.tacticalScenarios ?? undefined,
    fantasyAdvice: data.fantasyAdvice ?? undefined,
    historicalInsight: data.historicalInsight ?? undefined,
    headToHeadInsight: data.headToHeadInsight ?? undefined,
    expertVariables: data.expertVariables ?? undefined,
    socialGuide: data.socialGuide ?? undefined,
    sourceSummary: data.sourceSummary ?? undefined,
    disclaimer: data.disclaimer,
    promptVersion: data.promptVersion ?? undefined,
    source: data.source ?? undefined,
    sourceDataUpdatedAt: data.sourceDataUpdatedAt ?? undefined,
    rawInput: data.rawInput ?? undefined,
    rawOutput: data.rawOutput ?? undefined,
    contentWarnings: data.contentWarnings ?? undefined,
    generatedAt: new Date(),
    status: ReportStatus.DRAFT,
    publishedKey: null,
    publishedAt: null,
  };
}

/**
 * 按 (matchId, PRE_MATCH, inputHash) 唯一键写入草稿：已有行则 update，避免 regenerate 撞唯一约束。
 */
export async function upsertPreMatchDraft(
  prisma: TxClient,
  args: {
    matchId: string;
    inputHash: string;
    data: PreMatchDraftData;
    mode: AiReportDraftPersistenceMode;
  },
): Promise<UpsertPreMatchDraftResult> {
  const { matchId, inputHash, data } = args;

  const existing = await prisma.aiReport.findUnique({
    where: {
      matchId_reportType_inputHash: {
        matchId,
        reportType: AiReportType.PRE_MATCH,
        inputHash,
      },
    },
  });

  if (existing) {
    const report = await prisma.aiReport.update({
      where: { id: existing.id },
      data: preMatchDraftUpdateData(data),
    });
    await prisma.match.update({
      where: { id: matchId },
      data: { reportStatus: ReportStatus.DRAFT },
    });
    return { report, reused: true };
  }

  const report = await prisma.aiReport.create({
    data: {
      ...data,
      matchId,
      reportType: AiReportType.PRE_MATCH,
      inputHash,
      status: ReportStatus.DRAFT,
    },
  });
  await prisma.match.update({
    where: { id: matchId },
    data: { reportStatus: ReportStatus.DRAFT },
  });
  return { report, reused: false };
}

export type UpsertPostMatchDraftResult = {
  report: Prisma.AiReportGetPayload<Record<string, never>>;
  reused: boolean;
};

type PostMatchDraftData = Omit<
  Prisma.AiReportCreateInput,
  'match' | 'prediction' | 'oddsSnapshot'
> & {
  matchId: string;
  predictionId?: string | null;
  oddsSnapshotId?: string | null;
};

/**
 * 赛后报告无 inputHash：优先更新最新 DRAFT/REVIEW，否则 create。
 */
export async function upsertPostMatchDraft(
  prisma: TxClient,
  data: PostMatchDraftData,
): Promise<UpsertPostMatchDraftResult> {
  const { matchId } = data;

  const existing = await prisma.aiReport.findFirst({
    where: {
      matchId,
      reportType: AiReportType.POST_MATCH,
      status: { in: [ReportStatus.DRAFT, ReportStatus.REVIEW] },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (existing) {
    const report = await prisma.aiReport.update({
      where: { id: existing.id },
      data: {
        predictionId: data.predictionId ?? undefined,
        oddsSnapshotId: data.oddsSnapshotId ?? undefined,
        structuredContentJson: data.structuredContentJson ?? undefined,
        freeSummary: data.freeSummary,
        dashboardSummary: data.dashboardSummary ?? undefined,
        disclaimer: data.disclaimer,
        rawInput: data.rawInput ?? undefined,
        rawOutput: data.rawOutput ?? undefined,
        contentWarnings: data.contentWarnings ?? undefined,
        generatedAt: new Date(),
        status: ReportStatus.DRAFT,
        publishedKey: null,
        publishedAt: null,
      } satisfies Prisma.AiReportUncheckedUpdateInput,
    });
    return { report, reused: true };
  }

  const report = await prisma.aiReport.create({
    data: {
      ...data,
      matchId,
      reportType: AiReportType.POST_MATCH,
      status: ReportStatus.DRAFT,
    },
  });
  return { report, reused: false };
}
