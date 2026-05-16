import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

export class FeedbackBodyDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contact?: string;
}

@ApiTags('feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Post()
  @ApiOperation({ summary: '用户反馈（可选登录）' })
  async submit(
    @Body() dto: FeedbackBodyDto,
    @Headers('authorization') authorization?: string,
  ) {
    const viewer = await this.auth.resolveUserFromAuthHeader(authorization);
    const row = await this.prisma.userFeedback.create({
      data: {
        userId: viewer?.id,
        message: dto.message.trim(),
        contact: dto.contact?.trim() || null,
      },
    });
    return { ok: true as const, id: row.id };
  }
}
