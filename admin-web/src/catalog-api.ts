import { api } from './api';

export type CatalogStatus = 'present' | 'empty' | 'missing' | 'stale' | 'error';

export type LeagueB2Fields = {
  standings: CatalogStatus;
  topAssists: CatalogStatus;
  topYellowCards: CatalogStatus;
  topRedCards: CatalogStatus;
  fixtureRounds: CatalogStatus;
  topscorers: CatalogStatus;
};

export type LeaguesCatalogResponse = {
  season: number;
  items: Array<{
    code: string | null;
    nameCn: string;
    externalId: string | null;
    syncedAt: string | null;
    fields: LeagueB2Fields;
  }>;
};

export type TeamListItem = {
  id: string;
  nameCn: string;
  externalId: string | null;
};

export type TeamCatalogResponse = {
  teamId: string;
  nameCn: string;
  externalId: string | null;
  season: number;
  transfers: { status: CatalogStatus; syncedAt: string | null };
  trophies: { status: CatalogStatus; syncedAt: string | null };
};

export type PlayerCatalogResponse = {
  playerId: string;
  nameCn: string;
  externalId: string | null;
  trophies: { status: CatalogStatus; syncedAt: string | null };
  sidelined: { status: CatalogStatus; syncedAt: string | null };
};

export type MatchEnrichmentResponse = {
  matchId: string;
  season: number;
  teams: {
    home: (TeamCatalogResponse & { teamId: string }) | null;
    away: (TeamCatalogResponse & { teamId: string }) | null;
  };
  liveOdds: {
    count: number;
    lastCapturedAt: string | null;
    status: CatalogStatus;
  };
  players: Array<{
    playerId: string;
    nameCn: string;
    externalId: string | null;
    trophies: { status: CatalogStatus; syncedAt: string | null };
    sidelined: { status: CatalogStatus; syncedAt: string | null };
  }>;
};

export function fetchLeaguesCatalog(season: number) {
  return api<LeaguesCatalogResponse>(
    `/admin/api/af/leagues/catalog?season=${season}`,
  );
}

export function syncLeagueCatalog(code: string, season: number) {
  return api(`/admin/api/af/leagues/${encodeURIComponent(code)}/sync-catalog?season=${season}`, {
    method: 'POST',
  });
}

export function fetchAfTeams(q?: string) {
  const qs = new URLSearchParams({ take: '80' });
  if (q?.trim()) qs.set('q', q.trim());
  return api<{ items: TeamListItem[] }>(`/admin/api/af/teams?${qs}`);
}

export function fetchTeamCatalog(teamId: string, season: number) {
  return api<TeamCatalogResponse>(
    `/admin/api/af/teams/${teamId}/catalog?season=${season}`,
  );
}

export function syncTeamCatalog(teamId: string, season?: number) {
  const qs = season ? `?season=${season}` : '';
  return api(`/admin/api/af/teams/${teamId}/sync-catalog${qs}`, { method: 'POST' });
}

export function fetchAfPlayers(q?: string) {
  const qs = new URLSearchParams({ take: '80' });
  if (q?.trim()) qs.set('q', q.trim());
  return api<{ items: Array<{ id: string; nameCn: string; externalId: string | null }> }>(
    `/admin/api/af/players?${qs}`,
  );
}

export function fetchPlayerCatalog(playerId: string) {
  return api<PlayerCatalogResponse>(`/admin/api/af/players/${playerId}/catalog`);
}

export function syncPlayerCatalog(playerId: string) {
  return api(`/admin/api/af/players/${playerId}/sync-catalog`, { method: 'POST' });
}

export function fetchMatchEnrichment(matchId: string) {
  return api<MatchEnrichmentResponse>(`/admin/api/af/matches/${matchId}/enrichment`);
}
