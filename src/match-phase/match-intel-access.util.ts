import { MatchStatus, UserRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { RequestUser } from '../common/types/request-user.type';
import { MatchIntelUnlockPrice } from '../matches/match-intel.types';
import { UnlockService } from '../unlock/unlock.service';

export async function resolveIntelUnlocked(
  unlock: UnlockService,
  match: { id: string; status: MatchStatus },
  viewer: RequestUser | null,
): Promise<boolean> {
  if (viewer?.role === UserRole.ADMIN) return true;
  const userId = viewer?.id;
  if (match.status === MatchStatus.FINISHED && userId) return true;
  if (userId) return unlock.canAccessPaidIntel(userId, match.id);
  return false;
}

export function unlockPriceForMatch(
  config: ConfigService,
  match: { isFeatured: boolean },
): MatchIntelUnlockPrice {
  const featured = match.isFeatured === true;
  const cents = featured
    ? (config.get<number>('featuredReportUnlockPriceCents') ?? 990)
    : (config.get<number>('reportUnlockPriceCents') ?? 690);
  return {
    amountCents: cents,
    currency: 'CNY',
    display: `¥${(cents / 100).toFixed(1)}`,
    tier: featured ? 'featured' : 'standard',
  };
}
