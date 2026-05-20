import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, UserRole } from '@prisma/client';
import { RequestUser } from '../common/types/request-user.type';
import { UnlockService } from '../unlock/unlock.service';
import { unlockPriceForMatch } from '../match-phase/match-intel-access.util';
import type { MatchAccess, MatchAccessLevel } from './paywall.types';

@Injectable()
export class PaywallService {
  constructor(
    private readonly config: ConfigService,
    private readonly unlock: UnlockService,
  ) {}

  unlockPrice(match: { isFeatured: boolean }) {
    return unlockPriceForMatch(this.config, match);
  }

  async getMatchAccess(
    match: { id: string; status: MatchStatus; isFeatured: boolean },
    viewer: RequestUser | null,
  ): Promise<MatchAccess> {
    const isAdmin = viewer?.role === UserRole.ADMIN;
    const isLoggedIn = !!viewer?.id;
    const finishedFreeAll = this.config.get<boolean>('finishedFreeAll') !== false;

    if (isAdmin) {
      return this.fullAccess('admin', {
        isLoggedIn: true,
        isUnlocked: true,
        isMember: false,
        isAdmin: true,
      });
    }

    let isMember = false;
    let isUnlocked = false;
    if (viewer?.id) {
      isMember = await this.unlock.hasActiveMembership(viewer.id);
      isUnlocked =
        isMember ||
        (await this.unlock.canAccessPaidIntel(viewer.id, match.id)) ||
        (match.status === MatchStatus.FINISHED &&
          finishedFreeAll &&
          isLoggedIn);
    }

    if (isUnlocked) {
      const level: MatchAccessLevel =
        isMember ? 'member' : 'unlocked';
      return this.fullAccess(level, {
        isLoggedIn,
        isUnlocked: true,
        isMember,
        isAdmin: false,
      });
    }

    return {
      isLoggedIn,
      isUnlocked: false,
      isMember: false,
      isAdmin: false,
      accessLevel: isLoggedIn ? 'free' : 'guest',
      permissions: {
        basic: true,
        standingsBrief: true,
        recentResultsBrief: true,
        headToHeadBrief: true,
        injuries: true,
        lineups: true,
        predictions: false,
        odds: false,
        playerStatsFull: match.status !== MatchStatus.SCHEDULED,
        aiReports: false,
        tacticalScript: false,
        playerIntelligence: false,
        tacticalIntelligence: false,
      },
    };
  }

  cacheTier(access: MatchAccess): 'guest' | 'free' | 'unlocked' | 'admin' {
    if (access.isAdmin) return 'admin';
    if (access.isUnlocked) return 'unlocked';
    if (access.isLoggedIn) return 'free';
    return 'guest';
  }

  private fullAccess(
    level: MatchAccessLevel,
    base: Pick<MatchAccess, 'isLoggedIn' | 'isUnlocked' | 'isMember' | 'isAdmin'>,
  ): MatchAccess {
    return {
      ...base,
      accessLevel: level,
      permissions: {
        basic: true,
        standingsBrief: true,
        recentResultsBrief: true,
        headToHeadBrief: true,
        injuries: true,
        lineups: true,
        predictions: true,
        odds: true,
        playerStatsFull: true,
        aiReports: true,
        tacticalScript: true,
        playerIntelligence: true,
        tacticalIntelligence: true,
      },
    };
  }
}
