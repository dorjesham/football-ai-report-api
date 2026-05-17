import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REQUIRES_VERIFIED_PHONE_KEY } from '../decorators/requires-verified-phone.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../types/request-user.type';

@Injectable()
export class VerifiedPhoneGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiresPhone = this.reflector.getAllAndOverride<boolean>(REQUIRES_VERIFIED_PHONE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiresPhone) {
      return true;
    }

    if (this.config.get<boolean>('authRequireVerifiedPhone') !== true) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const userId = req.user?.id;
    if (!userId) {
      return true;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phoneVerifiedAt: true },
    });
    if (user?.phoneVerifiedAt) {
      return true;
    }

    throw new ForbiddenException({
      message: '请先绑定并验证手机号',
      code: 'PHONE_VERIFICATION_REQUIRED',
    });
  }
}
