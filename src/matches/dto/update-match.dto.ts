import { MatchStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateMatchDto {
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsEnum(MatchStatus)
  status?: MatchStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  homeScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  awayScore?: number;

  @IsOptional()
  @IsString()
  round?: string;

  @IsOptional()
  @IsString()
  stadium?: string;
}
