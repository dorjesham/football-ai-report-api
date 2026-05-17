import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderProduct,
  OrderStatus,
  PaymentProvider,
  Prisma,
} from '@prisma/client';
import { IncomingHttpHeaders } from 'http';
import { PrismaService } from '../prisma/prisma.service';
import { MatchCacheInvalidationService } from '../matches/match-cache-invalidation.service';
import { UserNotificationService } from '../user-notifications/user-notification.service';
import { WechatPayV3Service } from './wechat-pay-v3.service';

@Injectable()
export class WxpayService {
  private readonly log = new Logger(WxpayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly v3: WechatPayV3Service,
    private readonly matchCacheInvalidation: MatchCacheInvalidationService,
    private readonly notifications: UserNotificationService,
  ) {}

  /**
   * 微信支付 v3 回调：生产环境验签 + 解密 resource；开发环境跳过验签并信任 body/plain。
   */
  async handleNotify(
    headers: IncomingHttpHeaders,
    body: Record<string, unknown>,
    rawBody: string,
  ) {
    const verify = await this.v3.verifyNotifyAndDecrypt(
      headers as Record<string, string | string[] | undefined>,
      rawBody,
      body,
    );
    if (!verify.ok) {
      await this.prisma.apiLog.create({
        data: {
          provider: 'wxpay',
          endpoint: '/wxpay/notify',
          method: 'POST',
          statusCode: 401,
          success: false,
          message: verify.message,
        },
      });
      return { code: 'FAIL', message: verify.message };
    }

    const plain = verify.plain ?? body;
    const orderNo = String(
      plain.out_trade_no ?? plain['out_trade_no'] ?? body.out_trade_no ?? '',
    );
    const tradeState = String(
      plain.trade_state ?? plain['trade_state'] ?? body.trade_state ?? '',
    );
    const transactionId = String(
      plain.transaction_id ??
        plain['transaction_id'] ??
        body.transaction_id ??
        '',
    );

    if (!orderNo) {
      return { code: 'FAIL', message: 'missing out_trade_no' };
    }

    const order = await this.prisma.order.findUnique({ where: { orderNo } });
    if (!order) {
      return { code: 'FAIL', message: 'ORDER_NOT_FOUND' };
    }

    if (order.status === OrderStatus.PAID) {
      return { code: 'SUCCESS', message: 'OK' };
    }

    if (tradeState && tradeState !== 'SUCCESS') {
      return { code: 'SUCCESS', message: 'IGNORED' };
    }

    const notifyPayload = {
      outer: body,
      inner: plain,
    } as object;

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          paidAt: new Date(),
          wxTransactionId: transactionId || undefined,
          notifyRaw: notifyPayload,
        },
      });
      if (order.product === OrderProduct.SOCIAL_POSTER) {
        return;
      }
      if (
        order.product === OrderProduct.MEMBERSHIP_PRO_MONTH ||
        order.product === OrderProduct.MEMBERSHIP_PRO_QUARTER ||
        order.product === OrderProduct.MEMBERSHIP_PRO_YEAR
      ) {
        await this.applyMembershipPaid(tx, order.userId, order.product);
        return;
      }
      if (
        order.product !== OrderProduct.REPORT_UNLOCK &&
        order.product !== OrderProduct.FEATURED_REPORT_UNLOCK
      ) {
        this.log.warn(`wxpay notify: order ${orderNo} product=${order.product} skipped`);
        return;
      }
      if (!order.matchId) {
        this.log.warn(`wxpay notify: order ${orderNo} missing matchId for unlock`);
        return;
      }
      const txId = transactionId || String(body.transaction_id || body.transactionId || 'wx_tx');
      const unlock = await tx.paymentUnlock.findFirst({
        where: { userId: order.userId, matchId: order.matchId },
      });
      if (unlock) {
        await tx.paymentUnlock.update({
          where: { id: unlock.id },
          data: {
            status: OrderStatus.PAID,
            orderId: order.id,
            transactionId: txId,
          },
        });
      } else {
        await tx.paymentUnlock.create({
          data: {
            userId: order.userId,
            matchId: order.matchId,
            orderId: order.id,
            amount: order.amount,
            status: OrderStatus.PAID,
            provider: PaymentProvider.WECHAT,
            transactionId: txId,
          },
        });
      }
    });

    if (
      order.product === OrderProduct.REPORT_UNLOCK ||
      order.product === OrderProduct.FEATURED_REPORT_UNLOCK
    ) {
      if (order.matchId) {
        await this.matchCacheInvalidation.invalidateUserMatchUnlock(
          order.userId,
          order.matchId,
        );
      }
    } else if (
      order.product === OrderProduct.MEMBERSHIP_PRO_MONTH ||
      order.product === OrderProduct.MEMBERSHIP_PRO_QUARTER ||
      order.product === OrderProduct.MEMBERSHIP_PRO_YEAR
    ) {
      await this.matchCacheInvalidation.invalidateAllUserMatchCaches(order.userId);
    }

    try {
      await this.notifications.notifyOrderPaid(order.userId, {
        orderNo: order.orderNo,
        product: order.product,
        matchId: order.matchId,
        amount: order.amount,
      });
    } catch (e) {
      this.log.warn(`wxpay notify: user notification failed: ${String(e)}`);
    }

    return { code: 'SUCCESS', message: 'OK' };
  }

  private async applyMembershipPaid(
    tx: Prisma.TransactionClient,
    userId: string,
    product: OrderProduct,
  ) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    const now = new Date();
    const base =
      user?.membershipUntil && user.membershipUntil > now ? user.membershipUntil : now;
    const until = new Date(base);
    if (product === OrderProduct.MEMBERSHIP_PRO_MONTH) {
      until.setUTCMonth(until.getUTCMonth() + 1);
    } else if (product === OrderProduct.MEMBERSHIP_PRO_QUARTER) {
      until.setUTCMonth(until.getUTCMonth() + 3);
    } else if (product === OrderProduct.MEMBERSHIP_PRO_YEAR) {
      until.setUTCFullYear(until.getUTCFullYear() + 1);
    }
    await tx.user.update({
      where: { id: userId },
      data: { membershipUntil: until },
    });
  }
}
