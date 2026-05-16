import { IsBoolean, IsOptional } from 'class-validator';

export class IntelPipelineRunDto {
  @IsOptional()
  @IsBoolean()
  stopOnFailure?: boolean;

  @IsOptional()
  @IsBoolean()
  skipAfFacts?: boolean;

  @IsOptional()
  @IsBoolean()
  skipAfPreMatchSnapshots?: boolean;

  @IsOptional()
  @IsBoolean()
  skipFdIntel?: boolean;

  @IsOptional()
  @IsBoolean()
  skipPublicSources?: boolean;

  @IsOptional()
  @IsBoolean()
  skipWeather?: boolean;

  @IsOptional()
  @IsBoolean()
  skipDeepseekSmoke?: boolean;

  @IsOptional()
  @IsBoolean()
  skipAiReport?: boolean;
}
