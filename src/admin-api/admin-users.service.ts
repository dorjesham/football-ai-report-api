import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function maskPhone(phone: string | null): string | null {
  if (!phone || phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function maskEmail(email: string | null): string | null {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `**@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(opts: { take?: number; search?: string }) {
    const take = Math.min(100, opts.take ?? 50);
    const where = opts.search
      ? {
          OR: [
            { nickname: { contains: opts.search } },
            { email: { contains: opts.search } },
            { phone: { contains: opts.search } },
            { username: { contains: opts.search } },
          ],
        }
      : {};

    const rows = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        _count: {
          select: { favoriteMatches: true, unlocks: true },
        },
        browseHistories: {
          orderBy: { visitedAt: 'desc' },
          take: 1,
          select: { visitedAt: true },
        },
      },
    });

    return rows.map((u) => ({
      id: u.id,
      createdAt: u.createdAt,
      nickname: u.nickname,
      phone: maskPhone(u.phone),
      email: maskEmail(u.email),
      role: u.role,
      favoriteCount: u._count.favoriteMatches,
      unlockCount: u._count.unlocks,
      lastBrowseAt: u.browseHistories[0]?.visitedAt ?? null,
    }));
  }

  async getUserSummary(userId: string, revealPii = false) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            favoriteMatches: true,
            wcTeamFollows: true,
            orders: true,
            unlocks: true,
            feedbacks: true,
          },
        },
        favoriteMatches: { take: 10, orderBy: { createdAt: 'desc' } },
        browseHistories: { take: 10, orderBy: { visitedAt: 'desc' } },
        orders: { orderBy: { createdAt: 'desc' }, take: 20 },
        unlocks: { orderBy: { createdAt: 'desc' }, take: 20 },
        feedbacks: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const revenue = user.orders
      .filter((o) => o.status === 'PAID')
      .reduce((s, o) => s + o.amount, 0);

    return {
      id: user.id,
      createdAt: user.createdAt,
      nickname: user.nickname,
      phone: revealPii ? user.phone : maskPhone(user.phone),
      email: revealPii ? user.email : maskEmail(user.email),
      role: user.role,
      membershipUntil: user.membershipUntil,
      counts: user._count,
      totalPaidCents: revenue,
      favoriteMatches: user.favoriteMatches,
      browseHistories: user.browseHistories,
      orders: user.orders.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        amount: o.amount,
        status: o.status,
        product: o.product,
        paidAt: o.paidAt,
        matchId: o.matchId,
      })),
      unlocks: user.unlocks,
      feedbacks: user.feedbacks,
    };
  }

  async listGeneratedAssets(userId: string) {
    return this.prisma.userGeneratedAsset.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async listOrders(opts: { take?: number; status?: string }) {
    const take = Math.min(200, opts.take ?? 50);
    return this.prisma.order.findMany({
      where: opts.status ? { status: opts.status as never } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        user: { select: { id: true, nickname: true, phone: true, email: true } },
        match: {
          select: {
            id: true,
            homeTeam: { select: { nameCn: true } },
            awayTeam: { select: { nameCn: true } },
          },
        },
        unlocks: { select: { id: true, status: true } },
      },
    });
  }
}
