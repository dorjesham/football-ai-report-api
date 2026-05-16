import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { WechatLoginDto } from './dto/wechat-login.dto';
import {
  BindPhoneDto,
  BindWechatDto,
  PhoneOtpLoginDto,
  PhonePasswordLoginDto,
  PhoneRegisterDto,
  SendPhoneCodeDto,
  SetPasswordDto,
  UpdateProfileDto,
} from './dto/identity.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.type';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('wechat-login')
  @ApiOperation({ summary: '微信 code 登录/注册（可传昵称头像覆盖）' })
  wechatLogin(@Body() dto: WechatLoginDto) {
    return this.auth.wechatLogin(dto.code, dto.nickname, dto.avatarUrl);
  }

  @Public()
  @Post('phone/send-code')
  @ApiOperation({ summary: '发送手机验证码（占位短信；开发可开 ENABLE_SMS_OTP_DEBUG）' })
  sendPhoneCode(@Body() dto: SendPhoneCodeDto) {
    return this.auth.sendPhoneCode(dto.phone);
  }

  @Public()
  @Post('phone/register')
  @ApiOperation({ summary: '手机号 + 验证码注册（可选同时设置密码），再调用 bind-wechat 绑定微信' })
  phoneRegister(@Body() dto: PhoneRegisterDto) {
    return this.auth.phoneRegister(dto.phone, dto.code, dto.password);
  }

  @Public()
  @Post('phone/login-password')
  @ApiOperation({ summary: '手机号 + 密码登录' })
  phoneLoginPassword(@Body() dto: PhonePasswordLoginDto) {
    return this.auth.phonePasswordLogin(dto.phone, dto.password);
  }

  @Public()
  @Post('phone/login-otp')
  @ApiOperation({ summary: '手机号 + 验证码登录（须已注册）' })
  phoneLoginOtp(@Body() dto: PhoneOtpLoginDto) {
    return this.auth.phoneOtpLogin(dto.phone, dto.code);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('bind-phone')
  @ApiOperation({ summary: '已登录用户绑定手机号（验证码）' })
  bindPhone(@CurrentUser() user: RequestUser, @Body() dto: BindPhoneDto) {
    return this.auth.bindPhone(user.id, dto.phone, dto.code);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('bind-wechat')
  @ApiOperation({ summary: '已登录用户绑定微信（手机注册后使用）' })
  bindWechat(@CurrentUser() user: RequestUser, @Body() dto: BindWechatDto) {
    return this.auth.bindWechat(user.id, dto.code, dto.nickname, dto.avatarUrl);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Patch('password')
  @ApiOperation({ summary: '设置或修改登录密码（已设密码需传 currentPassword）' })
  setPassword(@CurrentUser() user: RequestUser, @Body() dto: SetPasswordDto) {
    return this.auth.setPassword(user.id, dto.newPassword, dto.currentPassword);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Patch('profile')
  @ApiOperation({ summary: '更新昵称、头像（可覆盖微信默认）' })
  updateProfile(@CurrentUser() user: RequestUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto.nickname, dto.avatarUrl);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user.id);
  }
}
