import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 短信发送占位实现：生产请替换为阿里云 / 腾讯云等。
 * 开发环境可配合 `ENABLE_SMS_OTP_DEBUG=true` 在 API 响应中回显验证码（勿用于生产）。
 */
@Injectable()
export class SmsService {
  private readonly log = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  async sendVerificationCode(phone: string, code: string): Promise<void> {
    const debug = this.config.get<boolean>('enableSmsOtpDebug') === true;
    this.log.log(`[SMS stub] phone=${phone} code=${code}${debug ? ' (debug: also returned in HTTP body)' : ''}`);
  }
}
