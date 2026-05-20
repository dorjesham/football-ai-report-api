import { IsArray, IsOptional, IsString } from 'class-validator';

export class PatchPreferencesDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  followedLeagues?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  followedCompetitionIds?: string[];
}

export const PREFERENCES_DEFAULTS = {
  followedLeagues: [] as string[],
  followedCompetitionIds: [] as string[],
};
