import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { REQUIRES_VERIFIED_PHONE_KEY } from '../decorators/requires-verified-phone.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { VerifiedPhoneGuard } from './verified-phone.guard';

describe('VerifiedPhoneGuard', () => {
  const reflector = new Reflector();
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  } as unknown as PrismaService;

  function ctx(userId?: string): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: userId ? { id: userId } : undefined }),
      }),
    } as ExecutionContext;
  }

  function guard(requirePhoneEnv: boolean) {
    const config = {
      get: (key: string) => (key === 'authRequireVerifiedPhone' ? requirePhoneEnv : undefined),
    } as ConfigService;
    return new VerifiedPhoneGuard(reflector, config, prisma);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === REQUIRES_VERIFIED_PHONE_KEY) return true;
      return false;
    });
  });

  it('allows when feature flag is off', async () => {
    await expect(guard(false).canActivate(ctx('u1'))).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('allows verified user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      phoneVerifiedAt: new Date(),
    });
    await expect(guard(true).canActivate(ctx('u1'))).resolves.toBe(true);
  });

  it('blocks unverified user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ phoneVerifiedAt: null });
    await expect(guard(true).canActivate(ctx('u1'))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
