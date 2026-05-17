import { BadRequestException } from '@nestjs/common';
import { BrowseHistoryType } from '@prisma/client';

const API_TO_PRISMA: Record<string, BrowseHistoryType> = {
  analysis: BrowseHistoryType.ANALYSIS,
  poster: BrowseHistoryType.POSTER,
  view: BrowseHistoryType.VIEW,
};

export function parseBrowseHistoryType(raw: string): BrowseHistoryType {
  const key = raw.trim().toLowerCase();
  const t = API_TO_PRISMA[key];
  if (!t) {
    throw new BadRequestException('type must be analysis | poster | view');
  }
  return t;
}

export function browseHistoryTypeToApi(type: BrowseHistoryType): string {
  return type.toLowerCase();
}

export function matchListTitle(match: {
  homeTeam: { nameCn: string };
  awayTeam: { nameCn: string };
  competition?: { nameCn: string } | null;
}): string {
  const base = `${match.homeTeam.nameCn} vs ${match.awayTeam.nameCn}`;
  return match.competition?.nameCn ? `${base} · ${match.competition.nameCn}` : base;
}

export function truncateSummary(text: string, max = 200): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}
