import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import type { User } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/types/request-user.type';
import {
  generateNumericOtp,
  hashOtp,
  maskPhone,
  normalizeCnPhone,
  verifyOtpHash,
} from './phone.util';
import { SmsService } from './sms.service';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sms: SmsService,
  ) {}

  async resolveUserFromAuthHeader(authorization?: string): Promise<RequestUser | null> {
    if (!authorization?.startsWith('Bearer ')) return null;
    const token = authorization.slice(7);
    try {
      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: this.config.get<string>('jwtSecret') || 'dev-only-change-me',
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return null;
      return { id: user.id, openid: user.openid ?? null, role: user.role };
    } catch {
      return null;
    }
  }

  /** 微信 jscode2session（真实调用；mock-admin/mock-user 仅在 wechatLogin 入口处理） */
  private async exchangeWechatJsCode(code: string): Promise<{ openid: string; unionid?: string }> {
    const appId = this.config.get<string>('wechatAppId');
    const secret = this.config.get<string>('wechatAppSecret');
    if (!appId || !secret) {
      this.log.warn(
        'WeChat login: WECHAT_APP_ID / WECHAT_APP_SECRET missing; jscode2session not called',
      );
      throw new UnauthorizedException(
        'WeChat app credentials missing; configure WECHAT_APP_ID and WECHAT_APP_SECRET (mock codes mock-admin / mock-user are handled separately when ENABLE_MOCK_LOGIN=true)',
      );
    }
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const { data } = await axios.get<{
      openid?: string;
      unionid?: string;
      errcode?: number;
      errmsg?: string;
    }>(url, { timeout: 10000 });
    if (!data.openid) {
      this.log.warn(
        `WeChat jscode2session failed: errcode=${data.errcode ?? 'n/a'} errmsg=${data.errmsg ?? 'n/a'} (js_code not logged)`,
      );
      throw new UnauthorizedException(data.errmsg || 'WeChat login failed');
    }
    return { openid: data.openid, unionid: data.unionid };
  }

  async wechatLogin(code: string, nickname?: string, avatarUrl?: string) {
    const enableMock = this.config.get<boolean>('enableMockLogin') === true;
    const adminOpenid = this.config.get<string>('adminBootstrapOpenid') || '';

    if (enableMock && (code === 'mock-admin' || code === 'mock-user')) {
      const oid = code === 'mock-admin' ? 'mock-admin-openid' : 'mock-user-openid';
      return this.upsertAndSign(oid, {
        nickname: nickname || (code === 'mock-admin' ? 'Mock Admin' : 'Mock User'),
        avatarUrl,
        role: code === 'mock-admin' ? UserRole.ADMIN : UserRole.USER,
      });
    }

    const { openid, unionid } = await this.exchangeWechatJsCode(code);
    const role =
      adminOpenid && openid === adminOpenid ? UserRole.ADMIN : UserRole.USER;
    return this.upsertAndSign(openid, {
      unionid,
      nickname,
      avatarUrl,
      role,
    });
  }

  private async upsertAndSign(
    openid: string,
    extra: {
      unionid?: string;
      nickname?: string;
      avatarUrl?: string;
      role: UserRole;
    },
  ) {
    const user = await this.prisma.user.upsert({
      where: { openid },
      create: {
        openid,
        unionid: extra.unionid,
        nickname: extra.nickname,
        avatarUrl: extra.avatarUrl,
        role: extra.role,
      },
      update: {
        unionid: extra.unionid ?? undefined,
        nickname: extra.nickname ?? undefined,
        avatarUrl: extra.avatarUrl ?? undefined,
        role: extra.role,
      },
    });
    return this.sign(user);
  }

  private sign(user: User) {
    const token = this.jwt.sign({ sub: user.id });
    return {
      accessToken: token,
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser(user: User) {
    return {
      id: user.id,
      openid: user.openid,
      role: user.role,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      phone: maskPhone(user.phone),
      phoneVerified: !!user.phoneVerifiedAt,
      hasPassword: !!user.passwordHash,
      linkedWechat: !!user.openid,
    };
  }

  private otpPepper(): string {
    return (
      this.config.get<string>('authOtpPepper') ||
      this.config.get<string>('jwtSecret') ||
      'dev-only-change-me'
    );
  }

  private otpTtlMs(): number {
    const s = this.config.get<number>('authOtpTtlSeconds');
    const sec = typeof s === 'number' && Number.isFinite(s) && s > 30 ? s : 300;
    return sec * 1000;
  }

  /** 发送手机验证码（占位短信） */
  async sendPhoneCode(phoneRaw: string) {
    const phone = normalizeCnPhone(phoneRaw);
    const since = new Date(Date.now() - 3600_000);
    const sent = await this.prisma.authPhoneOtp.count({
      where: { phone, createdAt: { gte: since } },
    });
    if (sent >= 5) {
      throw new BadRequestException('该号码发送过于频繁，请一小时后再试');
    }
    const code = generateNumericOtp(6);
    const codeHash = hashOtp(phone, code, this.otpPepper());
    const expiresAt = new Date(Date.now() + this.otpTtlMs());
    await this.prisma.authPhoneOtp.create({
      data: { phone, codeHash, expiresAt },
    });
    await this.sms.sendVerificationCode(phone, code);
    const debug = this.config.get<boolean>('enableSmsOtpDebug') === true;
    return debug ? { ok: true as const, ttlSeconds: Math.floor(this.otpTtlMs() / 1000), devCode: code } : { ok: true as const, ttlSeconds: Math.floor(this.otpTtlMs() / 1000) };
  }

  private async consumeOtpOrThrow(phone: string, code: string) {
    const pepper = this.otpPepper();
    const row = await this.prisma.authPhoneOtp.findFirst({
      where: {
        phone,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || !verifyOtpHash(phone, code, pepper, row.codeHash)) {
      throw new UnauthorizedException('验证码无效或已过期');
    }
    await this.prisma.authPhoneOtp.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
  }

  /** 手机验证码注册（openid 为空，可后续 bind-wechat） */
  async phoneRegister(phoneRaw: string, code: string, password?: string) {
    const phone = normalizeCnPhone(phoneRaw);
    const exists = await this.prisma.user.findUnique({ where: { phone } });
    if (exists) {
      throw new ConflictException('该手机号已注册，请直接登录');
    }
    await this.consumeOtpOrThrow(phone, code);
    let passwordHash: string | undefined;
    if (password) {
      passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    }
    const user = await this.prisma.user.create({
      data: {
        phone,
        phoneVerifiedAt: new Date(),
        passwordHash,
        nickname: `用户${phone.slice(-4)}`,
        role: UserRole.USER,
      },
    });
    return this.sign(user);
  }

  /** 手机号 + 密码登录 */
  async phonePasswordLogin(phoneRaw: string, password: string) {
    const phone = normalizeCnPhone(phoneRaw);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('账号不存在或未设置密码，请使用验证码登录或重置流程');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('手机号或密码错误');
    return this.sign(user);
  }

  /** 手机号 + 验证码快捷登录（须已注册） */
  async phoneOtpLogin(phoneRaw: string, code: string) {
    const phone = normalizeCnPhone(phoneRaw);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      throw new UnauthorizedException('该手机号尚未注册，请先完成注册');
    }
    await this.consumeOtpOrThrow(phone, code);
    const fresh = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!fresh) throw new UnauthorizedException();
    return this.sign(fresh);
  }

  /** 已登录（通常为微信先登录）绑定手机号 */
  async bindPhone(userId: string, phoneRaw: string, code: string) {
    const phone = normalizeCnPhone(phoneRaw);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.phone) {
      throw new BadRequestException('已绑定手机号');
    }
    const taken = await this.prisma.user.findFirst({
      where: { phone, NOT: { id: userId } },
    });
    if (taken) {
      throw new ConflictException('该手机号已被其他账号使用');
    }
    await this.consumeOtpOrThrow(phone, code);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { phone, phoneVerifiedAt: new Date() },
    });
    return { ok: true as const, user: this.toPublicUser(updated) };
  }

  /** 已登录（手机注册等）绑定微信 */
  async bindWechat(
    userId: string,
    code: string,
    nickname?: string,
    avatarUrl?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.openid) {
      throw new BadRequestException('已绑定微信，无需重复绑定');
    }
    const { openid, unionid } = await this.exchangeWechatJsCode(code);
    const other = await this.prisma.user.findUnique({ where: { openid } });
    if (other && other.id !== userId) {
      throw new ConflictException('该微信已绑定其他账号，请联系管理员处理合并');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        openid,
        unionid: unionid ?? undefined,
        ...(nickname !== undefined ? { nickname } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      },
    });
    return { ok: true as const, user: this.toPublicUser(updated) };
  }

  /** 设置或修改登录密码 */
  async setPassword(
    userId: string,
    newPassword: string,
    currentPassword?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.passwordHash) {
      if (!currentPassword) {
        throw new BadRequestException('已设置过密码，请提供 currentPassword');
      }
      const match = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!match) throw new UnauthorizedException('当前密码不正确');
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { ok: true as const, user: this.toPublicUser(updated) };
  }

  /** 更新昵称、头像（可覆盖微信默认） */
  async updateProfile(userId: string, nickname?: string, avatarUrl?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(nickname !== undefined ? { nickname } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      },
    });
    return { ok: true as const, user: this.toPublicUser(updated) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.toPublicUser(user);
  }
}
