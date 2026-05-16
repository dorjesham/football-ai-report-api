import {
  CompetitionLevel,
  DataSourceType,
} from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCompetitionDto {
  @IsOptional()
  @IsString()
  tournamentId?: string;

  @IsOptional()
  @IsString()
  seasonId?: string;

  @IsString()
  @MinLength(1)
  nameCn!: string;

  @IsString()
  @MinLength(1)
  nameEn!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  seasonName?: string;

  @IsOptional()
  @IsEnum(CompetitionLevel)
  level?: CompetitionLevel;

  @IsOptional()
  @IsEnum(DataSourceType)
  dataSource?: DataSourceType;
}
