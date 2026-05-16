import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MatchStatus,
  Order,
  OrderProduct,
  OrderStatus,
  PaymentProvider,
  ReportStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UnlockService } from '../unlock/unlock.service';
import { WechatPayV3Service } from '../wxpay/wechat-pay-v3.service';
import type { MembershipPlan } from './dto/create-membership-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly unlock: UnlockService,
    private readonly wxV3: WechatPayV3Service,
  ) {}

  /** 调微信 JSAPI 下单并写回 wxPrepayId、PAYING */
  private async attachWxJsapiPayParams(order: Order, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.openid?.trim()) {
      throw new BadRequestException('需使用微信登录（有 openid）后才能调起微信支付');
    }
    try {
      const { prepayId, payParams } = await this.wxV3.createJsapiOrderAndPayParams({
        description: order.description || '越位线',
        outTradeNo: order.orderNo,
        amountCents: order.amount,
        openid: user.openid.trim(),
      });
      await this.prisma.order.update({
        where: { id: order.id },
        data: { wxPrepayId: prepayId, status: OrderStatus.PAYING },
      });
      return payParams;
    } catch (e) {
      if (e instanceof ServiceUnavailableException) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  /** V2 价格表（分）：供小程序展示，与下单金额一致 */
  pricingCatalog() {
    return {
      version: 2 as const,
      currency: 'CNY',
      reportUnlockCents: this.config.get<number>('reportUnlockPriceCents') ?? 690,
      featuredReportUnlockCents:
        this.config.get<number>('featuredReportUnlockPriceCents') ?? 990,
      socialPosterCents: this.config.get<number>('socialPosterPriceCents') ?? 490,
      membership: {
        monthCents: this.config.get<number>('membershipProMonthCents') ?? 4990,
        quarterCents: this.config.get<number>('membershipProQuarterCents') ?? 12800,
        yearCents: this.config.get<number>('membershipProYearCents') ?? 36500,
      },
    };
  }

  async createForMatch(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');

    if (match.status === MatchStatus.FINISHED) {
      return {
        isUnlocked: true,
        order: null,
        payParams: null,
        hint: '已完赛场次对注册用户免费开放情报，无需购买解锁',
      };
    }

    const published = await this.prisma.aiReport.findFirst({
      where: { matchId, status: ReportStatus.PUBLISHED },
    });
    if (!published) {
      throw new BadRequestException('报告尚未发布，暂不可购买解锁');
    }

    if (await this.unlock.canAccessPaidIntel(userId, matchId)) {
      return { isUnlocked: true, order: null, payParams: null };
    }

    const featured = match.isFeatured === true;
    const product = featured ? OrderProduct.FEATURED_REPORT_UNLOCK : OrderProduct.REPORT_UNLOCK;
    const amount = featured
      ? this.config.get<number>('featuredReportUnlockPriceCents') ?? 990
      : this.config.get<number>('reportUnlockPriceCents') ?? 690;

    const pending = await this.prisma.order.findFirst({
      where: {
        userId,
        matchId,
        status: { in: [OrderStatus.CREATED, OrderStatus.PAYING] },
        product: { in: [OrderProduct.REPORT_UNLOCK, OrderProduct.FEATURED_REPORT_UNLOCK] },
      },
    });
    if (pending) {
      return {
        reused: true as const,
        order: pending,
        isUnlocked: false,
        payParams: null,
        hint: '已存在未完成的报告解锁订单，请先完成支付或关闭后再下单',
      };
    }

    const orderNo = `ord_${randomBytes(10).toString('hex')}`;

    const order = await this.prisma.order.create({
      data: {
        orderNo,
        userId,
        matchId,
        amount,
        status: OrderStatus.CREATED,
        provider: PaymentProvider.WECHAT,
        product,
        description: featured ? '焦点战报告解锁' : '报告解锁',
      },
    });

    const wxReady =
      this.config.get<string>('wxPayAppId') &&
      this.config.get<string>('wxPayMchId') &&
      this.config.get<string>('wxPayApiV3Key') &&
      this.config.get<string>('wxPaySerialNo') &&
      this.config.get<string>('wxPayPrivateKeyPath');

    if (!wxReady) {
      if (this.config.get<boolean>('enableWxpayDevPlaceholder') === true) {
        return {
          order,
          isUnlocked: false,
          payParams: null,
          hint: '微信支付商户配置缺失：请在环境变量中配置 WX_PAY_*，并上传私钥文件。',
        };
      }
      throw new BadRequestException('微信支付未配置完整');
    }

    const payParams = await this.attachWxJsapiPayParams(order, userId);
    const fresh = await this.prisma.order.findUnique({ where: { id: order.id } });
    return {
      order: fresh ?? order,
      isUnlocked: false,
      payParams,
    };
  }

  /** Pro 会员：月/季/年；支付成功后由 /wxpay/notify 延长 membershipUntil */
  async createMembershipOrder(userId: string, plan: MembershipPlan) {
    const productMap: Record<MembershipPlan, OrderProduct> = {
      month: OrderProduct.MEMBERSHIP_PRO_MONTH,
      quarter: OrderProduct.MEMBERSHIP_PRO_QUARTER,
      year: OrderProduct.MEMBERSHIP_PRO_YEAR,
    };
    const amountMap: Record<MembershipPlan, number> = {
      month: this.config.get<number>('membershipProMonthCents') ?? 4990,
      quarter: this.config.get<number>('membershipProQuarterCents') ?? 12800,
      year: this.config.get<number>('membershipProYearCents') ?? 36500,
    };
    const labelMap: Record<MembershipPlan, string> = {
      month: '越位线 Pro 月卡',
      quarter: '越位线 Pro 季卡',
      year: '越位线 Pro 年卡',
    };

    const product = productMap[plan];
    const amount = amountMap[plan];

    const pending = await this.prisma.order.findFirst({
      where: {
        userId,
        matchId: null,
        status: { in: [OrderStatus.CREATED, OrderStatus.PAYING] },
        product: {
          in: [
            OrderProduct.MEMBERSHIP_PRO_MONTH,
            OrderProduct.MEMBERSHIP_PRO_QUARTER,
            OrderProduct.MEMBERSHIP_PRO_YEAR,
          ],
        },
      },
    });
    if (pending) {
      return {
        reused: true as const,
        order: pending,
        payParams: null,
        hint: '已存在未完成的会员订单，请先完成支付或关闭后再下单',
      };
    }

    const orderNo = `ord_mem_${randomBytes(10).toString('hex')}`;
    const order = await this.prisma.order.create({
      data: {
        orderNo,
        userId,
        matchId: null,
        amount,
        status: OrderStatus.CREATED,
        provider: PaymentProvider.WECHAT,
        product,
        description: labelMap[plan],
      },
    });

    const wxReady =
      this.config.get<string>('wxPayAppId') &&
      this.config.get<string>('wxPayMchId') &&
      this.config.get<string>('wxPayApiV3Key') &&
      this.config.get<string>('wxPaySerialNo') &&
      this.config.get<string>('wxPayPrivateKeyPath');

    if (!wxReady) {
      if (this.config.get<boolean>('enableWxpayDevPlaceholder') === true) {
        return {
          order,
          payParams: null,
          hint: '微信支付未完整配置：会员订单已创建，联调前请在库内将订单置为 PAID。',
        };
      }
      throw new BadRequestException('微信支付未配置完整');
    }

    const payParams = await this.attachWxJsapiPayParams(order, userId);
    const fresh = await this.prisma.order.findUnique({ where: { id: order.id } });
    return {
      order: fresh ?? order,
      payParams,
    };
  }

  /** 社交分享海报单次购买（V2 ¥4.9，SOCIAL_POSTER_PRICE_CENTS）。支付完成后调用海报生成接口消耗一单。 */
  async createPosterOrder(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');

    const pending = await this.prisma.order.findFirst({
      where: {
        userId,
        matchId,
        product: OrderProduct.SOCIAL_POSTER,
        status: { in: [OrderStatus.CREATED, OrderStatus.PAYING] },
      },
    });
    if (pending) {
      return {
        reused: true as const,
        order: pending,
        payParams: null,
        hint: '已存在未完成的社交海报订单，请先完成支付或关闭后再下单',
      };
    }

    const amount = this.config.get<number>('socialPosterPriceCents') ?? 490;
    const orderNo = `ord_sp_${randomBytes(10).toString('hex')}`;

    const order = await this.prisma.order.create({
      data: {
        orderNo,
        userId,
        matchId,
        amount,
        status: OrderStatus.CREATED,
        provider: PaymentProvider.WECHAT,
        product: OrderProduct.SOCIAL_POSTER,
        posterConsumed: false,
        description: '社交分享海报（单次）',
      },
    });

    const wxReady =
      this.config.get<string>('wxPayAppId') &&
      this.config.get<string>('wxPayMchId') &&
      this.config.get<string>('wxPayApiV3Key') &&
      this.config.get<string>('wxPaySerialNo') &&
      this.config.get<string>('wxPayPrivateKeyPath');

    if (!wxReady) {
      if (this.config.get<boolean>('enableWxpayDevPlaceholder') === true) {
        return {
          order,
          payParams: null,
          hint: '微信支付未完整配置：社交海报订单已创建，联调前请在库内将订单置为 PAID 或使用 ENABLE_POSTER_DEV_BYPASS 跳过计费。',
        };
      }
      throw new BadRequestException('微信支付未配置完整');
    }

    const payParams = await this.attachWxJsapiPayParams(order, userId);
    const fresh = await this.prisma.order.findUnique({ where: { id: order.id } });
    return {
      order: fresh ?? order,
      payParams,
    };
  }

  async byOrderNo(userId: string, orderNo: string) {
    const order = await this.prisma.order.findUnique({ where: { orderNo } });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }
}
