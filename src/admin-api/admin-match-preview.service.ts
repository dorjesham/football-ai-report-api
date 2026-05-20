import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { RequestUser } from '../common/types/request-user.type';
import { MatchDetailBffService } from '../match-detail-bff/match-detail-bff.service';
import { PrismaService } from '../prisma/prisma.service';

export type PreviewView = 'guest' | 'locked' | 'unlocked';

@Injectable()
export class AdminMatchPreviewService {
  constructor(
    private readonly bff: MatchDetailBffService,
    private readonly prisma: PrismaService,
  ) {}

  async getUserPreview(matchId: string, view: PreviewView) {
    if (view === 'guest') {
      return this.bff.getDetailV2(matchId, null);
    }

    if (view === 'unlocked') {
      const unlock = await this.prisma.paymentUnlock.findFirst({
        where: { matchId, status: OrderStatus.PAID },
        orderBy: { createdAt: 'desc' },
      });
      const userId = unlock?.userId;
      if (userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (user) {
          return this.bff.getDetailV2(matchId, {
            id: user.id,
            role: user.role,
          } as RequestUser);
        }
      }
      const anyUser = await this.prisma.user.findFirst({ orderBy: { createdAt: 'desc' } });
      if (!anyUser) throw new NotFoundException('No users for unlocked preview');
      return this.bff.getDetailV2(matchId, {
        id: anyUser.id,
        role: anyUser.role,
      } as RequestUser);
    }

    const lockedUser = await this.prisma.user.findFirst({
      where: {
        NOT: {
          unlocks: {
            some: { matchId, status: OrderStatus.PAID },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!lockedUser) {
      return this.bff.getDetailV2(matchId, {
        id: 'admin-preview-locked',
        role: 'USER',
      } as RequestUser);
    }
    return this.bff.getDetailV2(matchId, {
      id: lockedUser.id,
      role: lockedUser.role,
    } as RequestUser);
  }
}
