import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ADMIN_ONLY_KEY } from '../decorators/admin-only.decorator';
import { RequestUser } from '../types/request-user.type';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!adminOnly) {
      return true;
    }
    const req = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = req.user;
    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin only');
    }
    return true;
  }
}
