import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SmsService } from './sms.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
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
  providers: [AuthService, SmsService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
