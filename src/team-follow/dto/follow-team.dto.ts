import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class FollowTeamDto {
  @ApiProperty({ description: '国家队 Team.id（cuid），须为 wc26- 种子队' })
  @IsString()
  @MinLength(8)
  teamId!: string;
}
