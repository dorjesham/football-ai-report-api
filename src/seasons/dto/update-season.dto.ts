import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateSeasonDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}
