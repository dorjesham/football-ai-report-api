import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async usersByDay(days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);
    const users = await this.prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const map = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      map.set(d.toISOString().slice(0, 10), 0);
    }
    for (const u of users) {
      const key = u.createdAt.toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  }

  async ordersByDay(days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PAID,
        paidAt: { gte: since },
      },
      select: { paidAt: true, amount: true },
    });
    const map = new Map<string, { count: number; revenueCents: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      map.set(d.toISOString().slice(0, 10), { count: 0, revenueCents: 0 });
    }
    for (const o of orders) {
      if (!o.paidAt) continue;
      const key = o.paidAt.toISOString().slice(0, 10);
      const cur = map.get(key) ?? { count: 0, revenueCents: 0 };
      cur.count++;
      cur.revenueCents += o.amount;
      map.set(key, cur);
    }
    return Array.from(map.entries()).map(([date, v]) => ({
      date,
      count: v.count,
      revenueCents: v.revenueCents,
    }));
  }

  async getOverviewCharts(days: number) {
    const [users7d, orders7d] = await Promise.all([
      this.usersByDay(days),
      this.ordersByDay(days),
    ]);
    return { users7d, orders7d };
  }

  async ordersByProduct() {
    const rows = await this.prisma.order.groupBy({
      by: ['product'],
      where: { status: OrderStatus.PAID },
      _count: { id: true },
      _sum: { amount: true },
    });
    return rows.map((r) => ({
      product: r.product,
      count: r._count.id,
      revenueCents: r._sum.amount ?? 0,
    }));
  }
}
