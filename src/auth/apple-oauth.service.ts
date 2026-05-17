import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRegistrationLimitService } from './auth-registration-limit.service';
import { parseAudienceList, verifyAppleIdToken } from './id-token.util';

@Injectable()
export class AppleOauthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly regLimit: AuthRegistrationLimitService,
  ) {}

  private audiences(): string[] {
    return parseAudienceList(this.config.get<string>('appleClientId'));
  }

  private async verifyToken(idToken: string) {
    return verifyAppleIdToken(idToken.trim(), this.audiences());
  }

  async loginWithIdToken(req: Request, idToken: string) {
    const { sub } = await this.verifyToken(idToken);
    const existing = await this.prisma.user.findUnique({ where: { appleSub: sub } });
    if (!existing) {
      await this.regLimit.assertRegistrationAllowed(req);
    }
    const user = await this.upsertByAppleSub(sub);
    return user;
  }

  async bindApple(userId: string, idToken: string): Promise<User> {
    const { sub } = await this.verifyToken(idToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.appleSub) {
      throw new BadRequestException('已绑定 Apple 账号');
    }
    const other = await this.prisma.user.findUnique({ where: { appleSub: sub } });
    if (other && other.id !== userId) {
      throw new ConflictException('该 Apple 账号已绑定其他用户');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { appleSub: sub },
    });
  }

  private async upsertByAppleSub(sub: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { appleSub: sub } });
    if (existing) return existing;
    return this.prisma.user.create({
      data: {
        appleSub: sub,
        nickname: 'Apple 用户',
        role: UserRole.USER,
      },
    });
  }
}
