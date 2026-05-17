import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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

export class BrowseHistoryBodyDto {
  @ApiProperty({ enum: ['analysis', 'poster', 'view'] })
  @IsIn(['analysis', 'poster', 'view'])
  type!: string;

  @ApiPropertyOptional({ description: '比赛 cuid；analysis/poster 必填' })
  @IsOptional()
  @IsString()
  matchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sub?: string;

  @ApiPropertyOptional({ description: 'ISO8601，默认当前时间' })
  @IsOptional()
  @IsDateString()
  visitedAt?: string;
}

export class NotificationPatchDto {
  @ApiProperty({ description: '标记已读' })
  @IsBoolean()
  read!: boolean;
}
