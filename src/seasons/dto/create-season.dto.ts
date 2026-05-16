import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSeasonDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  isCurrent?: boolean;
}
