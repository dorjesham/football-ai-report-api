import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { UserRole } from '@prisma/client';
import axios from 'axios';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthRegistrationLimitService } from './auth-registration-limit.service';
import type { Request } from 'express';

type OAuthState = { createdAt: number };

const memOAuthState = new Map<string, OAuthState>();

@Injectable()
export class WechatWebOauthService {
  private readonly log = new Logger(WechatWebOauthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly regLimit: AuthRegistrationLimitService,
  ) {}

  private openAppId(): string {
    const id = this.config.get<string>('wechatOpenAppId');
    if (!id) throw new BadRequestException('WECHAT_OPEN_APP_ID not configured');
    return id;
  }

  private openSecret(): string {
    const s = this.config.get<string>('wechatOpenAppSecret');
    if (!s) throw new BadRequestException('WECHAT_OPEN_APP_SECRET not configured');
    return s;
  }

  private redirectUri(): string {
    const u = this.config.get<string>('wechatWebOauthRedirectUri');
    if (!u) throw new BadRequestException('WECHAT_WEB_OAUTH_REDIRECT_URI not configured');
    return u;
  }

  async buildAuthorizeUrl(): Promise<{ url: string; state: string }> {
    const state = randomBytes(16).toString('hex');
    const ttl = 600;
    if (this.redis.enabled) {
      await this.redis.setJson(`auth:wxweb:state:${state}`, { ok: true }, ttl);
    } else {
      memOAuthState.set(state, { createdAt: Date.now() });
    }
    const appId = this.openAppId();
    const redirect = encodeURIComponent(this.redirectUri());
    const url =
      `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}` +
      `&redirect_uri=${redirect}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`;
    return { url, state };
  }

  private async consumeState(state: string): Promise<void> {
    if (this.redis.enabled) {
      const key = `auth:wxweb:state:${state}`;
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

  private async exchangeCode(code: string): Promise<{
    openid: string;
    unionid?: string;
    access_token?: string;
  }> {
    const appId = this.openAppId();
    const secret = this.openSecret();
    const url =
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}` +
      `&secret=${secret}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const { data } = await axios.get<{
      openid?: string;
      unionid?: string;
      access_token?: string;
      errcode?: number;
      errmsg?: string;
    }>(url, { timeout: 10000 });
    if (!data.openid) {
      this.log.warn(`WeChat web oauth failed: ${data.errmsg ?? data.errcode}`);
      throw new UnauthorizedException(data.errmsg || 'WeChat web login failed');
    }
    return {
      openid: data.openid,
      unionid: data.unionid,
      access_token: data.access_token,
    };
  }

  async upsertWebUser(openid: string, unionid?: string) {
    const adminOpenid = this.config.get<string>('adminBootstrapOpenid') || '';
    const role =
      adminOpenid && openid === adminOpenid ? UserRole.ADMIN : UserRole.USER;

    const byWeb = await this.prisma.user.findUnique({ where: { wechatWebOpenid: openid } });
    if (byWeb) {
      return this.prisma.user.update({
        where: { id: byWeb.id },
        data: { unionid: unionid ?? byWeb.unionid ?? undefined },
      });
    }

    if (unionid) {
      const byUnion = await this.prisma.user.findFirst({ where: { unionid } });
      if (byUnion) {
        return this.prisma.user.update({
          where: { id: byUnion.id },
          data: { wechatWebOpenid: openid, unionid },
        });
      }
    }

    return this.prisma.user.create({
      data: {
        wechatWebOpenid: openid,
        unionid,
        nickname: '微信用户',
        role,
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
    const tokenPack = await this.exchangeCode(code.trim());
    const existingWeb = await this.prisma.user.findUnique({
      where: { wechatWebOpenid: tokenPack.openid },
    });
    let existingUnion = null;
    if (tokenPack.unionid) {
      existingUnion = await this.prisma.user.findFirst({
        where: { unionid: tokenPack.unionid },
      });
    }
    if (!existingWeb && !existingUnion) {
      await this.regLimit.assertRegistrationAllowed(req);
    }
    const user = await this.upsertWebUser(tokenPack.openid, tokenPack.unionid);
    const { accessToken } = signUser(user);
    const front = this.config.get<string>('authWebFrontendCallback')?.trim();
    if (!front) {
      throw new BadRequestException('AUTH_WEB_FRONTEND_CALLBACK not configured');
    }
    const sep = front.includes('?') ? '&' : '?';
    const target = `${front}${sep}accessToken=${encodeURIComponent(accessToken)}`;
    res.redirect(302, target);
  }
}
