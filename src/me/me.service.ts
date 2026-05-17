import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiReportType,
  BrowseHistoryType,
  OrderProduct,
  OrderStatus,
  Prisma,
  ReportStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserNotificationService } from '../user-notifications/user-notification.service';
import {
  browseHistoryTypeToApi,
  matchListTitle,
  parseBrowseHistoryType,
  truncateSummary,
} from './me-browse.util';

const MATCH_LIST_INCLUDE = {
  homeTeam: true,
  awayTeam: true,
  competition: true,
  tournament: true,
} as const;

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: UserNotificationService,
  ) {}

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
    const matchIds = rows.map((o) => o.matchId).filter((id): id is string => !!id);
    const guides =
      matchIds.length ?
        await this.prisma.socialGuide.findMany({
          where: { matchId: { in: matchIds } },
          select: {
            matchId: true,
            posterImageUrl: true,
            posterGeneratedAt: true,
            posterPromptUser: true,
          },
        })
      : [];
    const guideByMatch = new Map(guides.map((g) => [g.matchId, g]));
    const last = rows[rows.length - 1];
    return {
      items: rows.map((o) => {
        const g = o.matchId ? guideByMatch.get(o.matchId) : undefined;
        return {
          orderNo: o.orderNo,
          status: o.status,
          amount: o.amount,
          posterConsumed: o.posterConsumed,
          createdAt: o.createdAt,
          paidAt: o.paidAt,
          matchId: o.matchId,
          match: o.match,
          imageUrl: g?.posterImageUrl ?? null,
          posterGeneratedAt: g?.posterGeneratedAt ?? null,
          template: g?.posterPromptUser ?? null,
        };
      }),
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
    const matchIds = [...new Set(rows.map((r) => r.matchId))];
    const reports =
      matchIds.length ?
        await this.prisma.aiReport.findMany({
          where: {
            matchId: { in: matchIds },
            status: ReportStatus.PUBLISHED,
            reportType: { in: [AiReportType.PRE_MATCH, AiReportType.POST_MATCH] },
          },
          orderBy: [{ publishedAt: 'desc' }, { generatedAt: 'desc' }],
          select: {
            matchId: true,
            status: true,
            freeSummary: true,
            reportType: true,
          },
        })
      : [];
    const reportByMatch = new Map<string, (typeof reports)[0]>();
    for (const r of reports) {
      if (!reportByMatch.has(r.matchId)) reportByMatch.set(r.matchId, r);
    }
    return rows.map((u) => {
      const report = reportByMatch.get(u.matchId);
      const unlockedAt = u.order?.paidAt ?? u.createdAt;
      return {
        id: u.id,
        matchId: u.matchId,
        amount: u.amount,
        createdAt: u.createdAt,
        unlockedAt,
        title: matchListTitle(u.match),
        reportStatus: report?.status ?? ReportStatus.NONE,
        freeSummary: report ? truncateSummary(report.freeSummary) : null,
        match: u.match,
        order: u.order,
      };
    });
  }

  async listBrowseHistory(userId: string, cursor?: string, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    let visitedBefore: Date | undefined;
    let idBefore: string | undefined;
    if (cursor?.trim()) {
      const cur = await this.prisma.userBrowseHistory.findFirst({
        where: { id: cursor.trim(), userId },
        select: { visitedAt: true, id: true },
      });
      if (cur) {
        visitedBefore = cur.visitedAt;
        idBefore = cur.id;
      }
    }
    const rows = await this.prisma.userBrowseHistory.findMany({
      where: {
        userId,
        ...(visitedBefore && idBefore ?
          {
            OR: [
              { visitedAt: { lt: visitedBefore } },
              { visitedAt: visitedBefore, id: { lt: idBefore } },
            ],
          }
        : {}),
      },
      orderBy: [{ visitedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      include: { match: { include: MATCH_LIST_INCLUDE } },
    });
    const page = rows.slice(0, take);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        type: browseHistoryTypeToApi(r.type),
        matchId: r.matchId,
        title: r.title,
        sub: r.sub,
        visitedAt: r.visitedAt,
        match: r.match,
      })),
      nextCursor: rows.length > take && last ? last.id : null,
    };
  }

  async recordBrowseHistory(
    userId: string,
    body: {
      type: string;
      matchId?: string;
      title?: string;
      sub?: string;
      visitedAt?: string;
    },
  ) {
    const type = parseBrowseHistoryType(body.type);
    if (
      (type === BrowseHistoryType.ANALYSIS || type === BrowseHistoryType.POSTER) &&
      !body.matchId?.trim()
    ) {
      throw new BadRequestException('matchId is required for analysis and poster history');
    }
    const visitedAt = body.visitedAt ? new Date(body.visitedAt) : new Date();
    if (Number.isNaN(visitedAt.getTime())) {
      throw new BadRequestException('Invalid visitedAt');
    }

    let title = body.title?.trim();
    let matchId: string | null = body.matchId?.trim() || null;
    let match: Prisma.MatchGetPayload<{ include: typeof MATCH_LIST_INCLUDE }> | null = null;

    if (matchId) {
      match = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: MATCH_LIST_INCLUDE,
      });
      if (!match) throw new NotFoundException('Match not found');
      if (!title) title = matchListTitle(match);
    } else if (!title) {
      title = '浏览记录';
    }

    if (matchId) {
      const row = await this.prisma.userBrowseHistory.upsert({
        where: {
          userId_matchId_type: { userId, matchId, type },
        },
        create: {
          userId,
          type,
          matchId,
          title,
          sub: body.sub?.trim() || null,
          visitedAt,
        },
        update: {
          title,
          sub: body.sub?.trim() || null,
          visitedAt,
        },
        include: { match: { include: MATCH_LIST_INCLUDE } },
      });
      return {
        id: row.id,
        type: browseHistoryTypeToApi(row.type),
        matchId: row.matchId,
        title: row.title,
        sub: row.sub,
        visitedAt: row.visitedAt,
        match: row.match,
      };
    }

    const row = await this.prisma.userBrowseHistory.create({
      data: {
        userId,
        type,
        matchId: null,
        title,
        sub: body.sub?.trim() || null,
        visitedAt,
      },
    });
    return {
      id: row.id,
      type: browseHistoryTypeToApi(row.type),
      matchId: row.matchId,
      title: row.title,
      sub: row.sub,
      visitedAt: row.visitedAt,
      match: null,
    };
  }

  listNotifications(
    userId: string,
    opts: { cursor?: string; limit?: number; unreadOnly?: boolean },
  ) {
    return this.notifications.list(userId, opts);
  }

  patchNotification(userId: string, id: string, read: boolean) {
    if (!read) throw new BadRequestException('Only marking read=true is supported');
    return this.notifications.markRead(userId, id);
  }

  readAllNotifications(userId: string) {
    return this.notifications.markAllRead(userId);
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
