import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class IdTokenLoginDto {
  @ApiProperty({ description: 'Apple 或 Google 返回的 id_token' })
  @IsString()
  @MinLength(10)
  idToken!: string;
}

export class BindIdTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  idToken!: string;
}
