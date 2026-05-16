import { CompetitionLevel, DataSourceType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateCompetitionDto {
  @IsOptional()
  @IsString()
  nameCn?: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsInt()
  currentMatchday?: number;

  @IsOptional()
  @IsEnum(CompetitionLevel)
  level?: CompetitionLevel;

  @IsOptional()
  @IsEnum(DataSourceType)
  dataSource?: DataSourceType;
}
