import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { RequestUser } from '../common/types/request-user.type';
import { MatchDetailBffService } from '../match-detail-bff/match-detail-bff.service';
import { PaywallService } from '../paywall/paywall.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MatchesV2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly detailBff: MatchDetailBffService,
    private readonly paywall: PaywallService,
    private readonly auth: AuthService,
  ) {}

  async resolveViewer(authorization?: string): Promise<RequestUser | null> {
    return this.auth.resolveUserFromAuthHeader(authorization);
  }

  getDetail(matchId: string, viewer: RequestUser | null) {
    return this.detailBff.getDetailV2(matchId, viewer);
  }

  async getAccess(matchId: string, viewer: RequestUser | null) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, status: true, isFeatured: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    const access = await this.paywall.getMatchAccess(match, viewer);
    return {
      schema: 'match-access-v1' as const,
      matchId,
      serverTime: new Date().toISOString(),
      isUnlocked: access.isUnlocked,
      access,
      paywall: {
        unlockType: 'single_match' as const,
        unlockPrice: this.paywall.unlockPrice(match),
      },
    };
  }
}
