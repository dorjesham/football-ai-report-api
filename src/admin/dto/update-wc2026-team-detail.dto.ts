import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsObject, IsOptional, IsString } from 'class-validator';

/** Admin PATCH：世界杯国家队展示扩展字段（写入 `Team.wc2026Profile` + `founded`） */
export class UpdateWc2026TeamDetailDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marketingSummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aiInsight?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contentVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  headCoachName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  qualificationLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  regionDisplayName?: string;

  @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
  @IsOptional()
  @IsArray()
  keyPlayers?: unknown[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tacticalTags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  tacticalPitch?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  aiPowerScore?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'API-Football 统计快照（一般由一键导入写入）' })
  @IsOptional()
  apiFootballTeamStats?: unknown;

  @ApiPropertyOptional({ description: '历史底蕴/赛前统计摘要中文（可覆盖自动写入）' })
  @IsOptional()
  @IsString()
  historicalHeritageZh?: string;

  @ApiPropertyOptional({ description: 'API-Football 球队卡片（/teams?id=）' })
  @IsOptional()
  apiFootballTeamCard?: unknown;

  @ApiPropertyOptional({ description: '成立年份；可留空表示不修改' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  founded?: number;
}
