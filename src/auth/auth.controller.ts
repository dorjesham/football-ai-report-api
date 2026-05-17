import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppleOauthService } from './apple-oauth.service';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha/captcha.service';
import { GoogleOauthService } from './google-oauth.service';
import { WechatWebOauthService } from './wechat-web-oauth.service';
import { BindIdTokenDto, IdTokenLoginDto } from './dto/oauth.dto';
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
import {
  ForgotPhonePasswordDto,
  LoginDto,
  RegisterDto,
  ResetPhonePasswordDto,
  SendPhoneCodeDtoV2,
} from './dto/register-login.dto';
import { Public } from '../common/decorators/public.decorator';
import { SkipEnvelope } from '../common/decorators/skip-envelope.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.type';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly captcha: CaptchaService,
    private readonly wechatWeb: WechatWebOauthService,
    private readonly appleOauth: AppleOauthService,
    private readonly googleOauth: GoogleOauthService,
  ) {}

  @Public()
  @Get('captcha')
  @ApiOperation({ summary: '获取图形验证码（注册等）' })
  getCaptcha() {
    return this.captcha.createChallenge();
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: '邮箱/用户名 + 密码注册（需图形验证码）' })
  register(@Req() req: Request, @Body() dto: RegisterDto) {
    return this.auth.register(req, dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: '邮箱或用户名 + 密码登录' })
  login(@Body() dto: LoginDto) {
    return this.auth.loginWithPassword(dto.identifier, dto.password);
  }

  @Public()
  @Post('wechat-login')
  @ApiOperation({ summary: '微信小程序 code 登录/注册' })
  wechatLogin(@Body() dto: WechatLoginDto) {
    return this.auth.wechatLogin(dto.code, dto.nickname, dto.avatarUrl);
  }

  @Public()
  @Get('wechat/web/authorize')
  @ApiOperation({
    summary: 'Web 微信扫码登录：跳转微信或返回 authorize URL',
    description: 'Query `json=1` 时返回 `{ url, state }`；否则 302 跳转微信',
  })
  async wechatWebAuthorize(
    @Query('json') json: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pack = await this.wechatWeb.buildAuthorizeUrl();
    if (json === '1' || json === 'true') {
      return pack;
    }
    res.redirect(302, pack.url);
  }

  @Public()
  @SkipEnvelope()
  @Get('wechat/web/callback')
  @ApiOperation({ summary: 'Web 微信 OAuth 回调（302 到前端并附带 accessToken）' })
  wechatWebCallback(
    @Req() req: Request,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    return this.wechatWeb.handleCallback(req, code, state, (user) => this.auth.sign(user), res);
  }

  @Public()
  @Post('apple/login')
  @ApiOperation({ summary: 'Apple Sign In（id_token）' })
  async appleLogin(@Req() req: Request, @Body() dto: IdTokenLoginDto) {
    const user = await this.appleOauth.loginWithIdToken(req, dto.idToken);
    return this.auth.sign(user);
  }

  @Public()
  @Get('google/authorize')
  @ApiOperation({
    summary: 'Google Web 登录：跳转 Google 或返回 authorize URL',
    description: 'Query `json=1` 时返回 `{ url, state }`',
  })
  async googleAuthorize(
    @Query('json') json: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pack = await this.googleOauth.buildAuthorizeUrl();
    if (json === '1' || json === 'true') {
      return pack;
    }
    res.redirect(302, pack.url);
  }

  @Public()
  @SkipEnvelope()
  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth 回调（302 到前端并附带 accessToken）' })
  googleCallback(
    @Req() req: Request,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    return this.googleOauth.handleCallback(req, code, state, (user) => this.auth.sign(user), res);
  }

  @Public()
  @Post('google/login')
  @ApiOperation({ summary: 'Google One Tap / 移动端 id_token 登录' })
  async googleLogin(@Req() req: Request, @Body() dto: IdTokenLoginDto) {
    const user = await this.googleOauth.loginWithIdToken(req, dto.idToken);
    return this.auth.sign(user);
  }

  @Public()
  @Post('phone/send-code')
  @ApiOperation({
    summary: '发送手机验证码（bind / reset_password）',
    description: '不再支持 register；注册请用 POST /auth/register',
  })
  sendPhoneCode(@Body() dto: SendPhoneCodeDtoV2) {
    return this.auth.sendPhoneCode(dto.phone, dto.purpose ?? 'bind');
  }

  @Public()
  @Post('phone/register')
  @ApiOperation({ summary: '[Deprecated] 手机号验证码注册（默认已关闭）' })
  phoneRegister(@Body() dto: PhoneRegisterDto) {
    return this.auth.phoneRegister(dto.phone, dto.code, dto.password);
  }

  @Public()
  @Post('phone/login-password')
  @ApiOperation({ summary: '手机号 + 密码登录（历史账号）' })
  phoneLoginPassword(@Body() dto: PhonePasswordLoginDto) {
    return this.auth.phonePasswordLogin(dto.phone, dto.password);
  }

  @Public()
  @Post('phone/login-otp')
  @ApiOperation({ summary: '[Deprecated] 手机号验证码登录（默认已关闭）' })
  phoneLoginOtp(@Body() dto: PhoneOtpLoginDto) {
    return this.auth.phoneOtpLogin(dto.phone, dto.code);
  }

  @Public()
  @Post('password/forgot-phone')
  @ApiOperation({ summary: '找回密码：向已注册手机号发送验证码' })
  forgotPhonePassword(@Body() dto: ForgotPhonePasswordDto) {
    return this.auth.forgotPhonePassword(dto.phone);
  }

  @Public()
  @Post('password/reset-phone')
  @ApiOperation({ summary: '找回密码：手机验证码 + 新密码' })
  resetPhonePassword(@Body() dto: ResetPhonePasswordDto) {
    return this.auth.resetPhonePassword(dto.phone, dto.code, dto.newPassword);
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
  @ApiOperation({ summary: '已登录用户绑定微信小程序（支付需 openid）' })
  bindWechat(@CurrentUser() user: RequestUser, @Body() dto: BindWechatDto) {
    return this.auth.bindWechat(user.id, dto.code, dto.nickname, dto.avatarUrl);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('bind-apple')
  @ApiOperation({ summary: '已登录用户绑定 Apple 账号' })
  async bindApple(@CurrentUser() user: RequestUser, @Body() dto: BindIdTokenDto) {
    const updated = await this.appleOauth.bindApple(user.id, dto.idToken);
    return { ok: true as const, user: this.auth.toPublicUser(updated) };
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('bind-google')
  @ApiOperation({ summary: '已登录用户绑定 Google 账号' })
  async bindGoogle(@CurrentUser() user: RequestUser, @Body() dto: BindIdTokenDto) {
    const updated = await this.googleOauth.bindGoogle(user.id, dto.idToken);
    return { ok: true as const, user: this.auth.toPublicUser(updated) };
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Patch('password')
  @ApiOperation({ summary: '设置或修改登录密码' })
  setPassword(@CurrentUser() user: RequestUser, @Body() dto: SetPasswordDto) {
    return this.auth.setPassword(user.id, dto.newPassword, dto.currentPassword);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Patch('profile')
  @ApiOperation({ summary: '更新昵称、头像' })
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
