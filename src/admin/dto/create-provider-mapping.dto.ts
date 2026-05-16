import { DataSourceType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateProviderMappingDto {
  @IsEnum(DataSourceType)
  provider!: DataSourceType;

  @IsOptional()
  @IsString()
  tournamentId?: string;

  @IsOptional()
  @IsString()
  competitionId?: string;

  @IsOptional()
  @IsString()
  providerCompetitionCode?: string;

  @IsOptional()
  @IsString()
  providerCompetitionId?: string;

  @IsOptional()
  @IsString()
  providerSeasonCode?: string;
}
