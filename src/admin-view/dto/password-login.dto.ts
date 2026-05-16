import { IsString, MinLength, MaxLength } from 'class-validator';

export class PasswordLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}
