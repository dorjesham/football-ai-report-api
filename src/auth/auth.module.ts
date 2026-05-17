import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RedisModule } from '../redis/redis.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRegistrationLimitService } from './auth-registration-limit.service';
import { AppleOauthService } from './apple-oauth.service';
import { CaptchaService } from './captcha/captcha.service';
import { GeetestCaptchaProvider } from './captcha/providers/geetest.provider';
import { SvgCaptchaProvider } from './captcha/providers/svg-captcha.provider';
import { GoogleOauthService } from './google-oauth.service';
import { SmsService } from './sms.service';
import { WechatWebOauthService } from './wechat-web-oauth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    RedisModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwtSecret') || 'dev-only-change-me',
        signOptions: {
          expiresIn: config.get<string>('jwtExpiresIn') || '30d',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SmsService,
    CaptchaService,
    SvgCaptchaProvider,
    GeetestCaptchaProvider,
    AuthRegistrationLimitService,
    WechatWebOauthService,
    AppleOauthService,
    GoogleOauthService,
    JwtStrategy,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
