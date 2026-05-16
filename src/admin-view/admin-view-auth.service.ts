import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { User, UserRole } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

function timingSafeStringEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

@Injectable()
export class AdminViewAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  extractToken(req: Request, queryToken?: string): string | undefined {
    const q = queryToken || (typeof req.query?.token === 'string' ? req.query.token : undefined);
    if (q) return q;
    const c = req.cookies?.admin_token as string | undefined;
    if (c) return c;
    const h = req.headers.authorization;
    if (h?.startsWith('Bearer ')) return h.slice(7).trim();
    return undefined;
  }

  async resolveAdmin(req: Request, queryToken?: string): Promise<User | null> {
    const token = this.extractToken(req, queryToken);
    if (!token) return null;
    try {
      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: this.config.get<string>('jwtSecret') || 'dev-only-change-me',
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.role !== UserRole.ADMIN) return null;
      return user;
    } catch {
      return null;
    }
  }

  /** 与配置中的账号密码一致时，为任意一名 ADMIN 用户签发与 API 相同的 JWT（写入 Cookie）。 */
  async signAdminTokenIfPasswordValid(
    username: string,
    password: string,
  ): Promise<string | null> {
    const expectedUser = this.config.get<string>('adminViewLoginUsername') ?? '';
    const expectedPass = this.config.get<string>('adminViewLoginPassword') ?? '';
    if (!expectedUser || !expectedPass) return null;
    if (!timingSafeStringEqual(username, expectedUser)) return null;
    if (!timingSafeStringEqual(password, expectedPass)) return null;

    const admin = await this.prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
      orderBy: { createdAt: 'asc' },
    });
    if (!admin) return null;

    return this.jwt.sign({ sub: admin.id });
  }

  passwordLoginConfigured(): boolean {
    const u = this.config.get<string>('adminViewLoginUsername') ?? '';
    const p = this.config.get<string>('adminViewLoginPassword') ?? '';
    return Boolean(u && p);
  }
}
