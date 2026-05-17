import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DataQuality,
  DataSourceType,
  OrderProduct,
  OrderStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserNotificationService } from '../user-notifications/user-notification.service';
import { GptImage2Client } from './gpt-image2.client';
import { assertFootballPosterTheme, buildPosterPrompt } from './poster-theme.validator';

type PosterBilling = 'DEV_BYPASS' | 'FREE_MONTHLY' | 'MEMBER' | 'PAID_ORDER';

@Injectable()
export class SocialGuideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly images: GptImage2Client,
    private readonly notifications: UserNotificationService,
  ) {}

  async generate(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) throw new NotFoundException('Match not found');

    return this.prisma.socialGuide.upsert({
      where: { matchId },
      create: {
        matchId,
        oneLiner: `${match.homeTeam.nameCn} 对阵 ${match.awayTeam.nameCn}：赛前观察点合集（演示）。`,
        keyMoments: ['开场节奏', '中场调整', '尾声体能'],
        shareCopy: '分享给朋友：理性看球，娱乐为主。',
        posterTitle: '赛前情报卡（演示）',
        shortVideoScript: '开场钩子→数据亮点→免责声明',
        momentsCopy: '朋友圈文案示例：关注球队近况与伤病，不构成投注建议。',
        xiaohongshuTitle: '赛前看点速览｜足球情报（演示）',
        dataQuality: DataQuality.AI_GENERATED,
        dataSource: DataSourceType.DEEPSEEK,
      },
      update: {
        oneLiner: `${match.homeTeam.nameCn} 对阵 ${match.awayTeam.nameCn}：赛前观察点合集（演示）。`,
      },
    });
  }

  get(matchId: string) {
    return this.prisma.socialGuide.findUnique({ where: { matchId } });
  }

  /** UTC 自然月 YYYYMM */
  private utcYearMonth(d: Date): number {
    return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
  }

  private monthlyPosterFreeAvailable(user: {
    posterFreeUtcYearMonth: number;
    posterFreeUsedInMonth: number;
  }): boolean {
    const ym = this.utcYearMonth(new Date());
    if (user.posterFreeUtcYearMonth !== ym) return true;
    return user.posterFreeUsedInMonth < 1;
  }

  private async resolvePosterBilling(
    userId: string,
    matchId: string,
  ): Promise<{ mode: PosterBilling; paidOrderId?: string }> {
    if (this.config.get<boolean>('enablePosterDevBypass') === true) {
      return { mode: 'DEV_BYPASS' };
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const now = new Date();
    if (user.membershipUntil && user.membershipUntil > now) {
      return { mode: 'MEMBER' };
    }

    if (this.monthlyPosterFreeAvailable(user)) {
      return { mode: 'FREE_MONTHLY' };
    }

    const paid = await this.prisma.order.findFirst({
      where: {
        userId,
        matchId,
        product: OrderProduct.SOCIAL_POSTER,
        status: OrderStatus.PAID,
        posterConsumed: false,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (paid) return { mode: 'PAID_ORDER', paidOrderId: paid.id };

    const cents = this.config.get<number>('socialPosterPriceCents') ?? 490;
    throw new HttpException(
      {
        code: 'POSTER_PAYMENT_REQUIRED',
        message: `本月免费海报已用完。可单次购买（¥${(cents / 100).toFixed(1)}）或开通 Pro 无限生成。`,
        posterPriceCents: cents,
        createOrderPath: 'POST /orders/social-poster/matches/:matchId/create',
        membershipOrderPath: 'POST /orders/membership/create',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  /**
   * 用户生成社交分享海报（GPT-Image2 兼容接口）。
   * 计费（V2）：Pro 会员无限 → 每月 1 张免费（UTC 月）→ 已支付 SOCIAL_POSTER 单场订单。
   */
  async generatePoster(matchId: string, userId: string, customElements: string) {
    const theme = assertFootballPosterTheme(customElements);
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) throw new NotFoundException('Match not found');

    const billing = await this.resolvePosterBilling(userId, matchId);
    let paidOrderNo: string | undefined;
    if (billing.mode === 'PAID_ORDER' && billing.paidOrderId) {
      const paidOrder = await this.prisma.order.findUnique({
        where: { id: billing.paidOrderId },
        select: { orderNo: true },
      });
      paidOrderNo = paidOrder?.orderNo;
    }
    const prompt = buildPosterPrompt({
      homeCn: match.homeTeam.nameCn,
      awayCn: match.awayTeam.nameCn,
      homeEn: match.homeTeam.nameEn,
      awayEn: match.awayTeam.nameEn,
      userTheme: theme,
    });

    const imageUrl = await this.images.generateImageUrl(prompt);

    const baseRow = await this.prisma.socialGuide.findUnique({
      where: { matchId },
    });

    const saved = await this.prisma.$transaction(async (tx) => {
      const sg = await tx.socialGuide.upsert({
        where: { matchId },
        create: {
          matchId,
          oneLiner: `${match.homeTeam.nameCn} vs ${match.awayTeam.nameCn} 赛前分享海报`,
          keyMoments: [],
          shareCopy: '理性看球，娱乐为主；海报为 AI 生成示意。',
          posterTitle: `${match.homeTeam.nameCn} vs ${match.awayTeam.nameCn}`,
          shortVideoScript: '',
          momentsCopy: '',
          xiaohongshuTitle: `${match.homeTeam.nameCn} vs ${match.awayTeam.nameCn} 看点`,
          posterImageUrl: imageUrl,
          posterPromptUser: theme,
          posterPromptFinal: prompt,
          posterGeneratedAt: new Date(),
          dataQuality: DataQuality.AI_GENERATED,
          dataSource: DataSourceType.UNKNOWN,
        },
        update: {
          posterImageUrl: imageUrl,
          posterPromptUser: theme,
          posterPromptFinal: prompt,
          posterGeneratedAt: new Date(),
          ...(baseRow?.oneLiner
            ? {}
            : {
                oneLiner: `${match.homeTeam.nameCn} vs ${match.awayTeam.nameCn} 赛前社交素材`,
              }),
        },
      });

      if (billing.mode === 'FREE_MONTHLY') {
        const u = await tx.user.findUnique({ where: { id: userId } });
        if (!u) throw new NotFoundException('User not found');
        const ym = this.utcYearMonth(new Date());
        const sameMonth = u.posterFreeUtcYearMonth === ym;
        await tx.user.update({
          where: { id: userId },
          data: sameMonth
            ? { posterFreeUsedInMonth: 1 }
            : { posterFreeUtcYearMonth: ym, posterFreeUsedInMonth: 1 },
        });
      } else if (billing.mode === 'PAID_ORDER' && billing.paidOrderId) {
        await tx.order.update({
          where: { id: billing.paidOrderId },
          data: { posterConsumed: true },
        });
      }

      return sg;
    });

    try {
      await this.notifications.notifyPosterReady(
        userId,
        matchId,
        match.homeTeam.nameCn,
        match.awayTeam.nameCn,
      );
    } catch {
      /* 通知失败不阻断海报生成 */
    }

    return {
      status: 'ok' as const,
      ok: true,
      billing: billing.mode,
      orderNo: paidOrderNo,
      posterImageUrl: saved.posterImageUrl,
      posterGeneratedAt: saved.posterGeneratedAt,
    };
  }

  /** 管理端或联调：仅校验主题并返回将提交的英文 prompt，不扣额度、不调图像接口。 */
  previewPosterPrompt(matchId: string, customElements: string) {
    const theme = assertFootballPosterTheme(customElements);
    return this.prisma.match
      .findUnique({
        where: { id: matchId },
        include: { homeTeam: true, awayTeam: true },
      })
      .then((match) => {
        if (!match) throw new NotFoundException('Match not found');
        return {
          prompt: buildPosterPrompt({
            homeCn: match.homeTeam.nameCn,
            awayCn: match.awayTeam.nameCn,
            homeEn: match.homeTeam.nameEn,
            awayEn: match.awayTeam.nameEn,
            userTheme: theme,
          }),
        };
      });
  }
}
