import { DataSourceType } from '@prisma/client';

export const SUPPLEMENTARY_FACTS_SCHEMA = 'supplementary-facts-v1' as const;

export type SupplementaryFactsV1 = {
  schema: typeof SUPPLEMENTARY_FACTS_SCHEMA;
  sources: Record<string, unknown>;
  updatedAt?: string;
};

export function parseSupplementaryFacts(raw: unknown): SupplementaryFactsV1 {
  if (!raw || typeof raw !== 'object') {
    return { schema: SUPPLEMENTARY_FACTS_SCHEMA, sources: {} };
  }
  const o = raw as Record<string, unknown>;
  if (o.schema === SUPPLEMENTARY_FACTS_SCHEMA && o.sources && typeof o.sources === 'object') {
    return {
      schema: SUPPLEMENTARY_FACTS_SCHEMA,
      sources: o.sources as Record<string, unknown>,
      updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : undefined,
    };
  }
  return {
    schema: SUPPLEMENTARY_FACTS_SCHEMA,
    sources: o as Record<string, unknown>,
  };
}

export function mergeSupplementarySource(
  existing: unknown,
  sourceKey: string,
  payload: unknown,
): SupplementaryFactsV1 {
  const prev = parseSupplementaryFacts(existing);
  return {
    schema: SUPPLEMENTARY_FACTS_SCHEMA,
    sources: { ...prev.sources, [sourceKey]: payload },
    updatedAt: new Date().toISOString(),
  };
}

/** 已有 API-Football 终场/赛中事实包时，第三方只写参考层 */
export function shouldUseSupplementaryOnly(facts: {
  afLastSyncedAt?: Date | null;
  afLiveLastSyncedAt?: Date | null;
  primaryProvider?: DataSourceType | null;
} | null): boolean {
  if (!facts) return false;
  if (facts.primaryProvider === DataSourceType.API_FOOTBALL) return true;
  if (facts.afLastSyncedAt != null) return true;
  return false;
}
