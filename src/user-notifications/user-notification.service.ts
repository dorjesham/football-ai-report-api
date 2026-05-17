import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderProduct, UserNotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CreateNotificationInput = {
  userId: string;
  type: UserNotificationType;
  title: string;
  desc: string;
  icon?: string;
  color?: string;
  link?: string;
  orderNo?: string;
};

@Injectable()
export class UserNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateNotificationInput) {
    return this.prisma.userNotification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        desc: input.desc,
        icon: input.icon,
        color: input.color,
        link: input.link,
        orderNo: input.orderNo,
      },
    });
  }

  async notifyOrderPaid(
    userId: string,
    order: {
      orderNo: string;
      product: OrderProduct;
      matchId: string | null;
      amount: number;
    },
  ) {
    const amountYuan = (order.amount / 100).toFixed(2);
    if (order.product === OrderProduct.SOCIAL_POSTER) {
      return this.create({
        userId,
        type: UserNotificationType.POSTER_CREDIT,
        title: '海报额度已到账',
        desc: `订单 ${order.orderNo} 支付成功（¥${amountYuan}），可前往比赛页生成海报。`,
        icon: 'image',
        color: 'green',
        orderNo: order.orderNo,
        link: order.matchId ? `/analysis/${order.matchId}` : '/poster',
      });
    }
    if (
      order.product === OrderProduct.MEMBERSHIP_PRO_MONTH ||
      order.product === OrderProduct.MEMBERSHIP_PRO_QUARTER ||
      order.product === OrderProduct.MEMBERSHIP_PRO_YEAR
    ) {
      return this.create({
        userId,
        type: UserNotificationType.MEMBERSHIP,
        title: '会员开通成功',
        desc: `订单 ${order.orderNo} 已支付（¥${amountYuan}），Pro 权益已生效。`,
        icon: 'crown',
        color: 'gold',
        orderNo: order.orderNo,
        link: '/upgrade',
      });
    }
    return this.create({
      userId,
      type: UserNotificationType.ORDER_PAID,
      title: '报告解锁成功',
      desc: `订单 ${order.orderNo} 已支付（¥${amountYuan}），可查看完整分析。`,
      icon: 'check',
      color: 'green',
      orderNo: order.orderNo,
      link: order.matchId ? `/analysis/${order.matchId}` : undefined,
    });
  }

  async notifyPosterReady(userId: string, matchId: string, homeCn: string, awayCn: string) {
    return this.create({
      userId,
      type: UserNotificationType.POSTER_READY,
      title: '海报已生成',
      desc: `${homeCn} vs ${awayCn} 的分享海报已生成，可下载分享。`,
      icon: 'image',
      color: 'blue',
      link: `/poster?matchId=${matchId}`,
    });
  }

  async list(
    userId: string,
    opts: { cursor?: string; limit?: number; unreadOnly?: boolean },
  ) {
    const take = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    let createdBefore: Date | undefined;
    let idBefore: string | undefined;
    if (opts.cursor?.trim()) {
      const cur = await this.prisma.userNotification.findFirst({
        where: { id: opts.cursor.trim(), userId },
        select: { createdAt: true, id: true },
      });
      if (cur) {
        createdBefore = cur.createdAt;
        idBefore = cur.id;
      }
    }
    const rows = await this.prisma.userNotification.findMany({
      where: {
        userId,
        ...(opts.unreadOnly ? { read: false } : {}),
        ...(createdBefore && idBefore ?
          {
            OR: [
              { createdAt: { lt: createdBefore } },
              { createdAt: createdBefore, id: { lt: idBefore } },
            ],
          }
        : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    const page = rows.slice(0, take);
    const last = page[page.length - 1];
    return {
      items: page.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        desc: n.desc,
        icon: n.icon,
        color: n.color,
        read: n.read,
        link: n.link,
        orderNo: n.orderNo,
        createdAt: n.createdAt,
      })),
      nextCursor: rows.length > take && last ? last.id : null,
    };
  }

  async markRead(userId: string, id: string) {
    const row = await this.prisma.userNotification.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Notification not found');
    return this.prisma.userNotification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllRead(userId: string) {
    const r = await this.prisma.userNotification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { ok: true as const, updated: r.count };
  }
}
