import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: '3-32 字母数字下划线' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,32}$/)
  username?: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  captchaId!: string;

  @ApiPropertyOptional({ description: 'SVG 验证码文本（provider=svg 时必填）' })
  @IsOptional()
  @IsString()
  captchaCode?: string;

  @ApiPropertyOptional({ description: '极验 lot_number（provider=geetest 时必填）' })
  @IsOptional()
  @IsString()
  lotNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  captchaOutput?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  passToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genTime?: string;
}

export class LoginDto {
  @ApiProperty({ description: '邮箱或用户名' })
  @IsString()
  @MinLength(1)
  identifier!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}

export class ForgotPhonePasswordDto {
  @ApiProperty()
  @IsString()
  phone!: string;
}

export class ResetPhonePasswordDto {
  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class SendPhoneCodeDtoV2 {
  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiPropertyOptional({ enum: ['bind', 'reset_password'], default: 'bind' })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.purpose != null)
  @Matches(/^(bind|reset_password)$/)
  purpose?: 'bind' | 'reset_password';
}
