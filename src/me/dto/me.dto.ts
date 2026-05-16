import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class FavoriteMatchBodyDto {
  @ApiProperty({ description: '比赛 cuid' })
  @IsString()
  matchId!: string;
}

export class MatchReminderBodyDto {
  @ApiProperty()
  @IsString()
  matchId!: string;

  @ApiPropertyOptional({ description: '开球前多少分钟', default: 60 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(24 * 60)
  notifyOffsetMinutes?: number;

  @ApiPropertyOptional({ default: 'app' })
  @IsOptional()
  @IsString()
  channel?: string;
}

export class MatchReminderPatchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(24 * 60)
  notifyOffsetMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
