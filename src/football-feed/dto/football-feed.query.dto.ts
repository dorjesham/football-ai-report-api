import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { API_FOOTBALL_DEFAULT_CODES } from '../../api-football/api-football.constants';

const COMP_CODES = [...API_FOOTBALL_DEFAULT_CODES] as string[];

export class FootballFeedLeagueSeasonDto {
  @ApiPropertyOptional({ description: 'API-Sports `league` id；与 `code` 二选一' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99_999)
  league?: number;

  @ApiPropertyOptional({
    enum: COMP_CODES,
    description: '本地联赛 code（PL/PD/…）；与 `league` 二选一',
  })
  @IsOptional()
  @IsString()
  @IsIn(COMP_CODES)
  code?: string;

  @ApiProperty({ example: 2024, description: '赛季起始年（与入库任务一致）' })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  season!: number;
}

export class FootballFeedFixturesQueryDto extends FootballFeedLeagueSeasonDto {
  @ApiPropertyOptional({ description: '分页', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @ApiPropertyOptional({
    description:
      'API 状态短码；不传时由服务端默认 `NS`（未开赛）。传 `NS-TBD` 等形式以官方文档为准。',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'API `from` 日期 yyyy-mm-dd' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'API `to` 日期 yyyy-mm-dd' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ description: '未来场次数量（上游 `next`）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  next?: number;

  @ApiPropertyOptional({ description: '上游 `round`（杯赛轮次等）' })
  @IsOptional()
  @IsString()
  round?: string;

  @ApiPropertyOptional({ description: '上游 `team` 球队 id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  team?: number;
}

export class FootballFeedFixtureIdQueryDto {
  @ApiProperty({ description: 'API-Football `fixture.id`' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fixture!: number;
}

export class FootballFeedH2hQueryDto extends FootballFeedLeagueSeasonDto {
  @ApiProperty({ example: '33-40', description: '上游 `h2h`，两队 id 用 `-` 连接' })
  @IsString()
  h2h!: string;

  @ApiPropertyOptional({ description: '上游 `date` yyyy-mm-dd' })
  @IsOptional()
  @IsString()
  date?: string;
}

export class FootballFeedPlayersQueryDto {
  @ApiProperty({ description: 'API-Sports 球队 id（非本地 Team.id）' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  team!: number;

  @ApiProperty({ example: 2024 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  season!: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;
}

export class FootballFeedPlayerProfileQueryDto {
  @ApiProperty({ description: 'API-Sports `player` id' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  player!: number;
}

export class FootballFeedPlayerSquadsQueryDto {
  @ApiProperty({ description: 'API-Sports `team` id' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  team!: number;
}

export class FootballFeedTopscorersQueryDto extends FootballFeedLeagueSeasonDto {}

export class FootballFeedPlayerSeasonsQueryDto {
  @ApiProperty({ description: 'API-Sports `player` id' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  player!: number;
}

export class FootballFeedInjuriesQueryDto extends FootballFeedLeagueSeasonDto {
  @ApiPropertyOptional({ description: '上游 `team`' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  team?: number;

  @ApiPropertyOptional({ description: '上游 `player`' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  player?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class FootballFeedPredictionsQueryDto {
  @ApiProperty({ description: '上游 `fixture` id' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fixture!: number;
}

export class FootballFeedOddsQueryDto {
  @ApiPropertyOptional({ description: '上游 `fixture`' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fixture?: number;

  @ApiPropertyOptional({ description: '与 `code` 二选一' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  league?: number;

  @ApiPropertyOptional({ enum: COMP_CODES })
  @IsOptional()
  @IsString()
  @IsIn(COMP_CODES)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  season?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class FootballFeedStandingsQueryDto extends FootballFeedLeagueSeasonDto {
  @ApiPropertyOptional({ description: '上游 `team` 筛选' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  team?: number;
}

export class FootballFeedTeamStatisticsQueryDto {
  @ApiProperty({ description: 'API-Sports `team` id' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  team!: number;

  @ApiPropertyOptional({ description: '上游 `league` id；与 `code` 二选一' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  league?: number;

  @ApiPropertyOptional({ enum: COMP_CODES })
  @IsOptional()
  @IsString()
  @IsIn(COMP_CODES)
  code?: string;

  @ApiProperty({ example: 2024 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  season!: number;
}
