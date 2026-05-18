import type { Prisma } from '@prisma/client';
import { extractMarketValueEuroFromProfile } from '../power-rating/player-ppr.calculator';

export const DEFAULT_MARKET_VALUE_CURRENCY = 'EUR' as const;

export function mapPlayerMarketValueFields(profile: Prisma.JsonValue | null | undefined) {
  const marketValue = extractMarketValueEuroFromProfile(profile);
  return {
    marketValue,
    marketValueCurrency: DEFAULT_MARKET_VALUE_CURRENCY,
  };
}
