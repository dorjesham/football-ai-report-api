const TOKEN_KEY = 'admin_access_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

type Envelope<T> = {
  success: boolean;
  data: T;
  message?: string;
  errorCode?: string;
};

export class ApiError extends Error {
  status: number;
  errorCode?: string;

  constructor(message: string, status: number, errorCode?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...init, headers });
  const json = (await res.json()) as Envelope<T> & { message?: string; errorCode?: string };
  if (!res.ok || json.success === false) {
    throw new ApiError(
      json.message || res.statusText,
      res.status,
      json.errorCode,
    );
  }
  return json.data;
}

export async function login(identifier: string, password: string) {
  const data = await api<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
  setToken(data.accessToken);
}

/** 世界杯 2026 运维 API（AF 唯一数据源） */
export const worldCupApi = {
  overview: () => api<Record<string, unknown>>('/admin/api/world-cup/overview'),
  bootstrap: (body: Record<string, unknown> = {}) =>
    api<{ jobId: string }>('/admin/api/world-cup/bootstrap', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  matches: (params?: { coverage?: string; status?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.coverage) q.set('coverage', params.coverage);
    if (params?.status) q.set('status', params.status);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return api<{ items: unknown[] }>(
      `/admin/api/world-cup/matches${qs ? `?${qs}` : ''}`,
    );
  },
  matchCoverage: (matchId: string) =>
    api<Record<string, unknown>>(`/admin/api/world-cup/matches/${matchId}/coverage`),
  reconcile: (matchId: string, body: { includeAi?: boolean } = {}) =>
    api<{ jobId: string }>(`/admin/api/world-cup/matches/${matchId}/reconcile`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  teams: () => api<{ items: unknown[] }>('/admin/api/world-cup/teams'),
  refreshTeamProfile: (teamId: string) =>
    api<{ jobId: string | null }>(`/admin/api/world-cup/teams/${teamId}/refresh-profile`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  generatePredictions: (body: { matchIds?: string[]; onlyMissing?: boolean } = {}) =>
    api<{ jobId: string }>('/admin/api/world-cup/predictions/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  teamNameOverrides: () =>
    api<{ items: Array<{ apiFootballTeamId: number; nameCn: string }> }>(
      '/admin/api/world-cup/team-name-overrides',
    ),
  upsertTeamNameOverride: (apiFootballTeamId: number, nameCn: string) =>
    api('/admin/api/world-cup/team-name-overrides', {
      method: 'POST',
      body: JSON.stringify({ apiFootballTeamId, nameCn }),
    }),
  standings: (season?: number) =>
    api<{ items: unknown[] }>(
      `/admin/api/world-cup/standings${season ? `?season=${season}` : ''}`,
    ),
  leaderboards: (metric = 'goals', season?: number) => {
    const q = new URLSearchParams({ metric });
    if (season) q.set('season', String(season));
    return api<{ items: unknown[] }>(`/admin/api/world-cup/leaderboards?${q}`);
  },
  patchTeamManual: (teamId: string, manual: Record<string, unknown>) =>
    api(`/admin/api/world-cup/teams/${teamId}/manual-profile`, {
      method: 'POST',
      body: JSON.stringify(manual),
    }),
  generateAiDrafts: (
    body: {
      matchIds?: string[];
      onlyPublishable?: boolean;
      forceRegenerateDraft?: boolean;
    } = {},
  ) =>
    api<{ jobId: string }>('/admin/api/world-cup/ai/generate-drafts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export const localizationApi = {
  overview: (competitionCode?: string) => {
    const q = competitionCode ? `?competitionCode=${encodeURIComponent(competitionCode)}` : '';
    return api<{
      teams: { total: number; translated: number };
      players: { total: number; translated: number };
      teamPct: number;
      playerPct: number;
    }>(`/admin/api/localization/overview${q}`);
  },
  listTranslations: (params?: { entityType?: string; status?: string; skip?: number; take?: number }) => {
    const q = new URLSearchParams();
    if (params?.entityType) q.set('entityType', params.entityType);
    if (params?.status) q.set('status', params.status);
    if (params?.skip != null) q.set('skip', String(params.skip));
    if (params?.take != null) q.set('take', String(params.take));
    const qs = q.toString();
    return api<Array<Record<string, unknown>>>(
      `/admin/api/localization/translations${qs ? `?${qs}` : ''}`,
    );
  },
  approve: (id: string) =>
    api(`/admin/api/localization/translations/${id}/approve`, { method: 'POST' }),
  reject: (id: string) =>
    api(`/admin/api/localization/translations/${id}/reject`, { method: 'POST' }),
  applySeed: () =>
    api<{ ok: boolean; stats: Record<string, number> }>('/admin/api/localization/seed/apply', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  backfill: (body: { competitionCodes?: string[]; entityTypes?: string[] } = {}) =>
    api<{ ok: boolean; summary: Record<string, unknown> }>('/admin/api/localization/backfill', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  llmDraft: (body: { entityTypes?: string[]; limit?: number } = {}) =>
    api<{ processed: number; skipped: number; errors: number }>(
      '/admin/api/localization/llm-draft',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  missing: (entityType = 'team', limit = 50) =>
    api<Array<Record<string, unknown>>>(
      `/admin/api/localization/translations/missing?entityType=${entityType}&limit=${limit}`,
    ),
};
