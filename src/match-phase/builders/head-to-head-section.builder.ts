import type { HeadToHeadInsight } from '@prisma/client';
import type {
  HeadToHeadRow,
  HeadToHeadSection,
  SectionAvailability,
} from '../match-detail-pre-unlocked.types';

type H2HMeetingRaw = {
  dateLabel?: string;
  competitionLabel?: string;
  homeName?: string;
  awayName?: string;
  homeScore?: number;
  awayScore?: number;
  resultLabel?: string;
  note?: string | null;
};

export function parseH2HMeetings(rawStats: unknown): HeadToHeadRow[] {
  if (!rawStats || typeof rawStats !== 'object') return [];
  const meetings = (rawStats as { meetings?: unknown }).meetings;
  if (!Array.isArray(meetings)) return [];
  const rows: HeadToHeadRow[] = [];
  for (const m of meetings) {
    if (!m || typeof m !== 'object') continue;
    const r = m as H2HMeetingRaw;
    if (r.homeScore == null || r.awayScore == null) continue;
    rows.push({
      dateLabel: r.dateLabel ?? '',
      competitionLabel: r.competitionLabel ?? '',
      homeName: r.homeName ?? '',
      awayName: r.awayName ?? '',
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      resultLabel: r.resultLabel ?? '—',
      note: r.note ?? null,
    });
  }
  return rows;
}

export function buildHeadToHeadSection(h2h: HeadToHeadInsight | null): {
  section: HeadToHeadSection;
  availability: SectionAvailability;
} {
  const rows = h2h ? parseH2HMeetings(h2h.rawStats) : [];
  const section: HeadToHeadSection = {
    summary: h2h?.summary ?? null,
    aggregate: {
      lastMeetingsCount: h2h?.lastMeetingsCount ?? null,
      homeWins: h2h?.homeWins ?? null,
      draws: h2h?.draws ?? null,
      awayWins: h2h?.awayWins ?? null,
    },
    rows,
  };

  const availability: SectionAvailability =
    rows.length >= 3 ? 'present'
    : rows.length > 0 || h2h?.summary ? 'partial'
    : 'missing';

  return { section, availability };
}
