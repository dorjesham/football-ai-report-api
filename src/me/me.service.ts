import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderProduct, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MATCH_LIST_INCLUDE = {
  homeTeam: true,
  awayTeam: true,
  competition: true,
  tournament: true,
} as const;

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async listFavorites(userId: string) {
    const rows = await this.prisma.userMatchFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { match: { include: MATCH_LIST_INCLUDE } },
    });
    return rows.map((r) => ({
      id: r.id,
      matchId: r.matchId,
      createdAt: r.createdAt,
      match: r.match,
    }));
  }

  async addFavorite(userId: string, matchId: string) {
    const m = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!m) throw new NotFoundException('Match not found');
    await this.prisma.userMatchFavorite.upsert({
      where: { userId_matchId: { userId, matchId } },
      create: { userId, matchId },
      update: {},
    });
    return { ok: true as const, matchId };
  }

  async removeFavorite(userId: string, matchId: string) {
    const r = await this.prisma.userMatchFavorite.deleteMany({
      where: { userId, matchId },
    });
    if (r.count === 0) throw new NotFoundException('Favorite not found');
    return { ok: true as const };
  }

  async listReminders(userId: string) {
    return this.prisma.userMatchReminder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { match: { include: MATCH_LIST_INCLUDE } },
    });
  }

  async createReminder(
    userId: string,
    body: { matchId: string; notifyOffsetMinutes?: number; channel?: string },
  ) {
    const m = await this.prisma.match.findUnique({ where: { id: body.matchId } });
    if (!m) throw new NotFoundException('Match not found');
    const existing = await this.prisma.userMatchReminder.findUnique({
      where: { userId_matchId: { userId, matchId: body.matchId } },
    });
    if (existing) throw new ConflictException('Reminder already exists for this match');
    return this.prisma.userMatchReminder.create({
      data: {
        userId,
        matchId: body.matchId,
        notifyOffsetMinutes: body.notifyOffsetMinutes ?? 60,
        channel: body.channel?.trim() || 'app',
      },
      include: { match: { include: MATCH_LIST_INCLUDE } },
    });
  }

  async patchReminder(
    userId: string,
    id: string,
    patch: { notifyOffsetMinutes?: number; channel?: string; active?: boolean },
  ) {
    const row = await this.prisma.userMatchReminder.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Reminder not found');
    return this.prisma.userMatchReminder.update({
      where: { id },
      data: {
        ...(patch.notifyOffsetMinutes !== undefined ?
          { notifyOffsetMinutes: patch.notifyOffsetMinutes }
        : {}),
        ...(patch.channel !== undefined ? { channel: patch.channel } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
      include: { match: { include: MATCH_LIST_INCLUDE } },
    });
  }

  async deleteReminder(userId: string, id: string) {
    const r = await this.prisma.userMatchReminder.deleteMany({ where: { id, userId } });
    if (r.count === 0) throw new NotFoundException('Reminder not found');
    return { ok: true as const };
  }

  async getPreferences(userId: string) {
    const row = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });
    return { data: (row?.data as Record<string, unknown>) ?? {} };
  }

  async patchPreferences(userId: string, partial: Record<string, unknown>) {
    const existing = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });
    const prev =
      existing?.data && typeof existing.data === 'object' && !Array.isArray(existing.data) ?
        (existing.data as Record<string, unknown>)
      : {};
    const merged = { ...prev, ...partial };
    const dataJson = merged as Prisma.InputJsonValue;
    const row = await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, data: dataJson },
      update: { data: dataJson },
    });
    return { data: row.data as Record<string, unknown> };
  }

  async listSocialPosters(userId: string, cursorOrderNo?: string, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    let createdBefore: Date | undefined;
    if (cursorOrderNo?.trim()) {
      const cur = await this.prisma.order.findFirst({
        where: { userId, orderNo: cursorOrderNo.trim() },
        select: { createdAt: true },
      });
      if (cur) createdBefore = cur.createdAt;
    }
    const rows = await this.prisma.order.findMany({
      where: {
        userId,
        product: OrderProduct.SOCIAL_POSTER,
        status: { in: [OrderStatus.PAID, OrderStatus.PAYING, OrderStatus.CREATED] },
        ...(createdBefore ? { createdAt: { lt: createdBefore } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      include: {
        match: {
          include: {
            homeTeam: true,
            awayTeam: true,
            competition: true,
          },
        },
      },
    });
    const last = rows[rows.length - 1];
    return {
      items: rows.map((o) => ({
        orderNo: o.orderNo,
        status: o.status,
        amount: o.amount,
        posterConsumed: o.posterConsumed,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        match: o.match,
      })),
      nextCursor: last ? last.orderNo : null,
    };
  }

  async listReportUnlocks(userId: string) {
    const rows = await this.prisma.paymentUnlock.findMany({
      where: { userId, status: OrderStatus.PAID },
      orderBy: { createdAt: 'desc' },
      include: {
        match: { include: MATCH_LIST_INCLUDE },
        order: { select: { orderNo: true, amount: true, product: true, paidAt: true } },
      },
    });
    return rows.map((u) => ({
      id: u.id,
      matchId: u.matchId,
      amount: u.amount,
      createdAt: u.createdAt,
      match: u.match,
      order: u.order,
    }));
  }

  async listOrders(
    userId: string,
    opts: { product?: OrderProduct; cursorOrderNo?: string; limit?: number },
  ) {
    const take = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    let createdBefore: Date | undefined;
    if (opts.cursorOrderNo?.trim()) {
      const cur = await this.prisma.order.findFirst({
        where: { userId, orderNo: opts.cursorOrderNo.trim() },
        select: { createdAt: true },
      });
      if (cur) createdBefore = cur.createdAt;
    }
    const rows = await this.prisma.order.findMany({
      where: {
        userId,
        ...(opts.product ? { product: opts.product } : {}),
        ...(createdBefore ? { createdAt: { lt: createdBefore } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      include: {
        match: {
          include: {
            homeTeam: true,
            awayTeam: true,
            competition: true,
          },
        },
      },
    });
    const last = rows[rows.length - 1];
    return {
      items: rows.map((o) => ({
        orderNo: o.orderNo,
        status: o.status,
        product: o.product,
        amount: o.amount,
        matchId: o.matchId,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        posterConsumed: o.posterConsumed,
        match: o.match,
      })),
      nextCursor: last ? last.orderNo : null,
    };
  }
}
