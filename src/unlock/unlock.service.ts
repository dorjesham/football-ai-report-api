import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UnlockService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pro 会员在有效期内视为全站情报已解锁（单场仍写 PaymentUnlock 由支付回调处理）。 */
  async hasActiveMembership(userId: string): Promise<boolean> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { membershipUntil: true },
    });
    return !!(u?.membershipUntil && u.membershipUntil > new Date());
  }

  async hasPaidUnlock(userId: string, matchId: string): Promise<boolean> {
    const row = await this.prisma.paymentUnlock.findFirst({
      where: { userId, matchId, status: OrderStatus.PAID },
    });
    return !!row;
  }

  /** 赛前情报付费区：会员或单场已购 */
  async canAccessPaidIntel(userId: string | undefined, matchId: string): Promise<boolean> {
    if (!userId) return false;
    if (await this.hasActiveMembership(userId)) return true;
    return this.hasPaidUnlock(userId, matchId);
  }
}
