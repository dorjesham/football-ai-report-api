import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminConsoleRole, UserRole } from '@prisma/client';
import { ADMIN_CONSOLE_ROLES_KEY } from '../decorators/admin-console-role.decorator';
import { RequestUser } from '../types/request-user.type';
import { PrismaService } from '../../prisma/prisma.service';

const RANK: Record<AdminConsoleRole, number> = {
  READONLY: 0,
  FINANCE_ADMIN: 1,
  CONTENT_ADMIN: 2,
  OPS_ADMIN: 3,
  DEVELOPER: 4,
  SUPER_ADMIN: 5,
};

@Injectable()
export class AdminConsoleRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<AdminConsoleRole[]>(
      ADMIN_CONSOLE_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest<{
      user?: RequestUser;
      method?: string;
    }>();
    const user = req.user;
    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin only');
    }

    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { adminConsoleRole: true },
    });
    const role = row?.adminConsoleRole ?? AdminConsoleRole.SUPER_ADMIN;

    if (role === AdminConsoleRole.SUPER_ADMIN) return true;

    if (role === AdminConsoleRole.READONLY && req.method !== 'GET') {
      throw new ForbiddenException('只读角色不可执行写操作');
    }

    const userRank = RANK[role] ?? 0;
    const minRequired = Math.min(...required.map((r) => RANK[r]));
    if (userRank < minRequired) {
      throw new ForbiddenException('权限不足');
    }
    return true;
  }
}
