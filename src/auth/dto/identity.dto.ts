import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendPhoneCodeDto {
  @ApiProperty({ example: '13800138000', description: '11 位中国大陆手机号' })
  @IsString()
  @Matches(/^1\d{10}$/, { message: '须为 11 位中国大陆手机号' })
  phone!: string;
}

export class PhoneRegisterDto {
  @ApiProperty({ example: '13800138000' })
  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;

  @ApiProperty({ example: '123456', description: '短信验证码' })
  @IsString()
  @Length(4, 8)
  code!: string;

  @ApiPropertyOptional({
    description: '可选：注册同时设置登录密码（≥8 位）；也可注册后在已登录态调用 set-password',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;
}

export class PhonePasswordLoginDto {
  @ApiProperty()
  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

export class PhoneOtpLoginDto {
  @ApiProperty()
  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;

  @ApiProperty()
  @IsString()
  @Length(4, 8)
  code!: string;
}

export class BindPhoneDto {
  @ApiProperty()
  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;

  @ApiProperty()
  @IsString()
  @Length(4, 8)
  code!: string;
}

export class BindWechatDto {
  @ApiProperty({ description: '小程序 wx.login 返回的 code' })
  @IsString()
  @MinLength(4)
  code!: string;

  @ApiPropertyOptional({ description: '可选：覆盖昵称（否则用微信会话信息）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string;

  @ApiPropertyOptional({ description: '可选：覆盖头像 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string;
}

export class SetPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;

  @ApiPropertyOptional({
    description: '已设置过密码时必填，用于校验旧密码',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  currentPassword?: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string;
}
