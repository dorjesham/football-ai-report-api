export const MATCH_EVENTS_V1_SCHEMA = 'match-events-v1' as const;

export type LiveEventSource =
  | 'API_FOOTBALL'
  | 'FOOTBALL_DATA'
  | 'SYNTHETIC_SCORE';

export type LiveEventV1 = {
  id: string;
  source: LiveEventSource;
  minute: number | null;
  extraMinute: number | null;
  type: string;
  detail: string | null;
  teamSide: 'home' | 'away' | null;
  teamName: string | null;
  playerName: string | null;
  assistName: string | null;
};

export type MatchEventsStorageV1 = {
  schema: typeof MATCH_EVENTS_V1_SCHEMA;
  items: LiveEventV1[];
};

export type LiveMetaJson = {
  seq?: number;
  lastHomeScore?: number | null;
  lastAwayScore?: number | null;
  lastPublishAt?: string;
};
