import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { UserRole } from '@prisma/client';
import axios from 'axios';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthRegistrationLimitService } from './auth-registration-limit.service';
import { verifyGoogleIdToken } from './id-token.util';

type OAuthState = { createdAt: number };

const memOAuthState = new Map<string, OAuthState>();

@Injectable()
export class GoogleOauthService {
  private readonly log = new Logger(GoogleOauthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly regLimit: AuthRegistrationLimitService,
  ) {}

  private clientId(): string {
    const id = this.config.get<string>('googleClientId');
    if (!id) throw new BadRequestException('GOOGLE_CLIENT_ID not configured');
    return id;
  }

  private clientSecret(): string {
    const s = this.config.get<string>('googleClientSecret');
    if (!s) throw new BadRequestException('GOOGLE_CLIENT_SECRET not configured');
    return s;
  }

  private redirectUri(): string {
    const u = this.config.get<string>('googleOauthRedirectUri');
    if (!u) throw new BadRequestException('GOOGLE_OAUTH_REDIRECT_URI not configured');
    return u;
  }

  private frontendCallback(): string {
    const u = this.config.get<string>('authGoogleFrontendCallback');
    if (!u) throw new BadRequestException('AUTH_WEB_FRONTEND_CALLBACK not configured');
    return u;
  }

  async buildAuthorizeUrl(): Promise<{ url: string; state: string }> {
    const state = randomBytes(16).toString('hex');
    const ttl = 600;
    if (this.redis.enabled) {
      await this.redis.setJson(`auth:google:state:${state}`, { ok: true }, ttl);
    } else {
      memOAuthState.set(state, { createdAt: Date.now() });
    }
    const params = new URLSearchParams({
      client_id: this.clientId(),
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return { url, state };
  }

  private async consumeState(state: string): Promise<void> {
    if (this.redis.enabled) {
      const key = `auth:google:state:${state}`;
      const raw = await this.redis.getJson<{ ok: boolean }>(key);
      await this.redis.del(key);
      if (!raw?.ok) throw new UnauthorizedException('Invalid or expired OAuth state');
      return;
    }
    const rec = memOAuthState.get(state);
    memOAuthState.delete(state);
    if (!rec || Date.now() - rec.createdAt > 600_000) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }
  }

  private async exchangeCode(code: string): Promise<{ sub: string; email?: string; name?: string; picture?: string }> {
    const { data: tokenData } = await axios.post<{
      access_token?: string;
      id_token?: string;
      error?: string;
    }>(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code,
        client_id: this.clientId(),
        client_secret: this.clientSecret(),
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      },
    );

    if (tokenData.id_token) {
      const verified = await verifyGoogleIdToken(tokenData.id_token, this.clientId());
      return verified;
    }

    if (!tokenData.access_token) {
      this.log.warn(`Google token exchange failed: ${tokenData.error ?? 'no token'}`);
      throw new UnauthorizedException('Google login failed');
    }

    const { data: profile } = await axios.get<{
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
    }>('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      timeout: 10000,
    });

    if (!profile.sub) {
      throw new UnauthorizedException('Google userinfo missing sub');
    }
    return {
      sub: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    };
  }

  async upsertByGoogleSub(
    sub: string,
    profile?: { name?: string; picture?: string },
  ): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { googleSub: sub } });
    if (existing) return existing;
    return this.prisma.user.create({
      data: {
        googleSub: sub,
        nickname: profile?.name?.trim() || 'Google 用户',
        avatarUrl: profile?.picture,
        role: UserRole.USER,
      },
    });
  }

  async loginWithIdToken(req: Request, idToken: string): Promise<User> {
    const verified = await verifyGoogleIdToken(idToken.trim(), this.clientId());
    const existing = await this.prisma.user.findUnique({ where: { googleSub: verified.sub } });
    if (!existing) {
      await this.regLimit.assertRegistrationAllowed(req);
    }
    return this.upsertByGoogleSub(verified.sub, {
      name: verified.name,
      picture: verified.picture,
    });
  }

  async bindGoogle(userId: string, idToken: string): Promise<User> {
    const verified = await verifyGoogleIdToken(idToken.trim(), this.clientId());
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.googleSub) {
      throw new BadRequestException('已绑定 Google 账号');
    }
    const other = await this.prisma.user.findUnique({ where: { googleSub: verified.sub } });
    if (other && other.id !== userId) {
      throw new ConflictException('该 Google 账号已绑定其他用户');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        googleSub: verified.sub,
        ...(verified.picture && !user.avatarUrl ? { avatarUrl: verified.picture } : {}),
        ...(verified.name && !user.nickname ? { nickname: verified.name } : {}),
      },
    });
  }

  async handleCallback(
    req: Request,
    code: string | undefined,
    state: string | undefined,
    signUser: (user: User) => { accessToken: string },
    res: Response,
  ): Promise<void> {
    if (!code?.trim() || !state?.trim()) {
      throw new BadRequestException('code and state are required');
    }
    await this.consumeState(state.trim());
    const profile = await this.exchangeCode(code.trim());
    const existing = await this.prisma.user.findUnique({ where: { googleSub: profile.sub } });
    if (!existing) {
      await this.regLimit.assertRegistrationAllowed(req);
    }
    const user = await this.upsertByGoogleSub(profile.sub, profile);
    const { accessToken } = signUser(user);
    const front = this.frontendCallback();
    const sep = front.includes('?') ? '&' : '?';
    res.redirect(302, `${front}${sep}accessToken=${encodeURIComponent(accessToken)}`);
  }
}
