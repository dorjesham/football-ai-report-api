import {
  MATCH_EVENTS_V1_SCHEMA,
  type LiveEventV1,
  type MatchEventsStorageV1,
} from './live-event.types';
import { mergeLiveEventLists } from './live-event-dedup.util';
import { normalizeAfEvents } from './af-events-normalizer.util';

export function parseMatchEventsStorage(raw: unknown): MatchEventsStorageV1 {
  if (!raw || typeof raw !== 'object') {
    return { schema: MATCH_EVENTS_V1_SCHEMA, items: [] };
  }
  const o = raw as Record<string, unknown>;
  if (o.schema === MATCH_EVENTS_V1_SCHEMA && Array.isArray(o.items)) {
    return { schema: MATCH_EVENTS_V1_SCHEMA, items: o.items as LiveEventV1[] };
  }
  if (Array.isArray(raw)) {
    return {
      schema: MATCH_EVENTS_V1_SCHEMA,
      items: normalizeAfEvents(raw),
    };
  }
  return { schema: MATCH_EVENTS_V1_SCHEMA, items: [] };
}

export function mergeEventsIntoStorage(
  existing: unknown,
  incoming: LiveEventV1[],
): MatchEventsStorageV1 {
  const prev = parseMatchEventsStorage(existing);
  return {
    schema: MATCH_EVENTS_V1_SCHEMA,
    items: mergeLiveEventLists(prev.items, incoming),
  };
}
