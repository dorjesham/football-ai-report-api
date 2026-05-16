import { IsString, MinLength } from 'class-validator';

export class SetSessionDto {
  @IsString()
  @MinLength(20)
  token!: string;
}
