import type { PostMatchStructuredV1 } from './schemas/structured-report.schema';
import type { LiveNarrativeStructuredV1 } from './schemas/structured-report.schema';

export function structuredToPolishPrompt(
  structured: PostMatchStructuredV1 | LiveNarrativeStructuredV1,
): { sectionKeys: string[]; userPrompt: string } {
  if (structured.schema === 'live-narrative-v1') {
    const keys = ['summary', ...structured.timeline.map((_, i) => `timeline_${i}`)];
    const sections: Record<string, string> = {
      summary: structured.summary.text,
    };
    structured.timeline.forEach((t, i) => {
      sections[`timeline_${i}`] = t.line;
    });
    return {
      sectionKeys: keys,
      userPrompt: JSON.stringify({ task: 'polish_only', sections }, null, 2),
    };
  }

  const keys = [
    'recap',
    'turningPoints',
    'motm',
    'keyPlayers',
    ...(structured.predictionReview?.length ? ['predictionReview'] : []),
  ];
  const sections: Record<string, string> = {
    recap: structured.recap.map((c) => c.text).join('\n'),
    turningPoints: structured.turningPoints.map((c) => c.text).join('\n'),
    motm: `${structured.motm.playerName}（${structured.motm.teamSide}）：${structured.motm.rationale.map((r) => r.text).join(' ')}`,
    keyPlayers: structured.keyPlayers
      .map((p) => `${p.playerName}：${p.highlights.map((h) => h.text).join(' ')}`)
      .join('\n'),
  };
  if (structured.predictionReview?.length) {
    sections.predictionReview = structured.predictionReview.map((c) => c.text).join('\n');
  }
  return {
    sectionKeys: keys,
    userPrompt: JSON.stringify({ task: 'polish_only', sections }, null, 2),
  };
}

export function polishedToFreeSummary(
  sections: Record<string, string>,
  schema: 'post-match-analysis-v1' | 'live-narrative-v1',
): string {
  if (schema === 'live-narrative-v1') {
    const summary = sections.summary ?? '';
    const timeline = Object.keys(sections)
      .filter((k) => k.startsWith('timeline_'))
      .sort()
      .map((k) => sections[k])
      .filter(Boolean)
      .join('\n');
    return [summary, timeline].filter(Boolean).join('\n\n').slice(0, 8000);
  }
  const parts = [
    sections.recap,
    sections.turningPoints,
    sections.motm,
    sections.keyPlayers,
    sections.predictionReview,
  ].filter(Boolean);
  return parts.join('\n\n').slice(0, 8000);
}
