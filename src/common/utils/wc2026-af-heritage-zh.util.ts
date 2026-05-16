import type { Prisma } from '@prisma/client';

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

/**
 * 用 API-Football `teams/statistics` 的 `response` 根对象生成一段中性中文摘要（只陈述数字/走势，不承诺赛果）。
 */
export function buildWcHistoricalHeritageZhFromAfStats(
  statsRoot: Record<string, unknown> | null,
): string {
  if (!statsRoot) {
    return '【公开数据】暂无 API-Football 国家队赛季统计可读字段。';
  }
  const form = typeof statsRoot.form === 'string' ? statsRoot.form.trim() : '';
  const fixtures = asRecord(statsRoot.fixtures);
  const played = asRecord(fixtures?.played);
  const total =
    played?.total != null && played.total !== '' ? Number(played.total) : null;
  const goals = asRecord(statsRoot.goals);
  const gFor = asRecord(goals?.for);
  const gAgainst = asRecord(goals?.against);
  const avgFor = asRecord(gFor?.average)?.total;
  const avgAg = asRecord(gAgainst?.average)?.total;
  const biggest = asRecord(statsRoot.biggest);
  const streakStr =
    typeof statsRoot.streak === 'string' ?
      statsRoot.streak
    : typeof biggest?.streak === 'string' ?
      String(biggest.streak)
    : '';

  const lines: string[] = [];
  lines.push(
    '【赛前公开统计线索】以下由 API-Football 国家队/杯赛赛季统计自动摘要，仅供赛前阅读，不构成赛果或投注建议。',
  );
  if (form) {
    lines.push(`近若干场走势字符（上游 form）：${form.slice(0, 24)}。`);
  }
  if (total != null && Number.isFinite(total)) {
    lines.push(
      `本赛事赛季内样本场次合计约 ${total}（主/客场分项见 wc2026Profile.apiFootballTeamStats）。`,
    );
  }
  if (avgFor != null || avgAg != null) {
    lines.push(
      `场均入球约 ${avgFor ?? '—'}、场均失球约 ${avgAg ?? '—'}（与足联正式口径可能不同，以官方发布为准）。`,
    );
  }
  if (streakStr) {
    lines.push(`连胜/连败等 streak 字段：${streakStr.slice(0, 80)}。`);
  }
  lines.push(
    '历史底蕴与大赛气质需结合临场阵容、对手与公开新闻再读；若已有运营撰写的 marketingSummary / aiInsight，建议仍以人工段落为主、本段为数据补充。',
  );
  return lines.join('');
}

/** 控制 JSON 体积：整段过大时只保留预览，避免 wc2026Profile 爆行。 */
export function shrinkJsonForWcProfile(
  raw: unknown,
  maxChars = 14_000,
): Prisma.InputJsonValue {
  try {
    const s = JSON.stringify(raw ?? null);
    if (s.length <= maxChars) {
      return (raw ?? null) as Prisma.InputJsonValue;
    }
    return {
      truncated: true,
      approxSize: s.length,
      preview: s.slice(0, maxChars),
    } as Prisma.InputJsonValue;
  } catch {
    return { error: 'json_stringify_failed' } as Prisma.InputJsonValue;
  }
}
