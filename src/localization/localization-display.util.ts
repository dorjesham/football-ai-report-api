import type { DisplayNameService } from './display-name.service';
import type { FootballDictionaryService } from './football-dictionary.service';
import type { DisplayNameResult } from './localization.types';

export function withTeamDisplay<T extends { nameCn: string; nameEn: string }>(
  dns: DisplayNameService,
  team: T,
): T & DisplayNameResult {
  return { ...team, ...dns.resolveTeam(team) };
}

export function withCompetitionDisplay<T extends { nameCn: string; nameEn: string; code?: string | null; apiSportsLeagueId?: number | null }>(
  dns: DisplayNameService,
  comp: T,
): T & DisplayNameResult {
  return { ...comp, ...dns.resolveCompetition(comp) };
}

export function withPlayerDisplay<T extends { nameCn: string; nameEn: string; externalId?: string | null }>(
  dns: DisplayNameService,
  player: T,
): T & DisplayNameResult {
  return { ...player, ...dns.resolvePlayer(player) };
}

export function statusCnFromDict(
  dict: FootballDictionaryService,
  short: string | null | undefined,
): string | null {
  return dict.matchStatusCn(short);
}
