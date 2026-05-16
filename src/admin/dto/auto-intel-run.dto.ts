import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class AutoIntelRunDto {
  @ApiPropertyOptional({ enum: ['prediction', 'full'], description: 'prediction=仅生成预测；full=Phase C 全管线（默认跳过 AI 报告草稿）' })
  @IsOptional()
  @IsIn(['prediction', 'full'])
  mode?: 'prediction' | 'full';

  @ApiPropertyOptional({ description: '向前看多少小时内开赛的比赛', minimum: 6, maximum: 168, default: 72 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(6)
  @Max(168)
  lookaheadHours?: number;

  @ApiPropertyOptional({ description: '最早开球时间：不早于「现在 − lookbackHours」', minimum: 0, maximum: 72, default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(72)
  lookbackHours?: number;

  @ApiPropertyOptional({ description: '本轮最多处理场数', minimum: 1, maximum: 50, default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxMatches?: number;

  @ApiPropertyOptional({
    description: 'full 模式下是否跳过 AI 报告（true=跳过，推荐；false=连报告草稿一起跑，较慢）',
    default: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  skipAiReport?: boolean;

  @ApiPropertyOptional({ description: '两场之间间隔毫秒', minimum: 0, maximum: 60000, default: 2000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60_000)
  delayMs?: number;
}
