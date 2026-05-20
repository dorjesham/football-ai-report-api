import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    action: string;
    targetType?: string;
    targetId?: string;
    operatorId?: string;
    operatorName?: string;
    beforeJson?: unknown;
    afterJson?: unknown;
    ip?: string;
    userAgent?: string;
  }) {
    return this.prisma.adminAuditLog.create({
      data: {
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        operatorId: input.operatorId,
        operatorName: input.operatorName ?? 'admin',
        beforeJson: input.beforeJson as Prisma.InputJsonValue | undefined,
        afterJson: input.afterJson as Prisma.InputJsonValue | undefined,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });
  }

  async list(opts: {
    take?: number;
    action?: string;
    operatorId?: string;
    from?: string;
    to?: string;
  }) {
    const take = Math.min(200, opts.take ?? 50);
    const where: Prisma.AdminAuditLogWhereInput = {};
    if (opts.action) where.action = opts.action;
    if (opts.operatorId) where.operatorId = opts.operatorId;
    if (opts.from || opts.to) {
      where.createdAt = {};
      if (opts.from) where.createdAt.gte = new Date(opts.from);
      if (opts.to) where.createdAt.lte = new Date(opts.to);
    }
    return this.prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
