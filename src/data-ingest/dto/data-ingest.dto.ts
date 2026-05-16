import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class FdFinishedIngestDto {
  @ApiPropertyOptional({
    example: ['PL', 'CL'],
    description: 'football-data 赛事 code，默认五大联赛+欧冠常用子集',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  codes?: string[];

  @ApiProperty({ example: '2024-08-01' })
  @IsDateString()
  dateFrom!: string;

  @ApiProperty({ example: '2024-12-31' })
  @IsDateString()
  dateTo!: string;
}

export class StatsbombOpenDataIngestDto {
  @ApiProperty({
    example: 11,
    description: 'StatsBomb `matches/{competition_id}/{season_id}.json` 中的 competition_id',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  sbCompetitionId!: number;

  @ApiProperty({
    example: 90,
    description: 'StatsBomb 赛季 id（与 open-data 仓库中路径一致，如 La Liga 某季为 90）',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  sbSeasonId!: number;

  @ApiProperty({ example: 'PD', description: '本地 Competition.code（用于模糊关联 Match）' })
  @IsString()
  competitionCode!: string;

  @ApiPropertyOptional({
    description:
      '覆盖默认 `STATS_BOMB_OPEN_DATA_BASE_URL`（不含 `/matches/...` 后缀的 data 根目录）',
  })
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiPropertyOptional({
    example: 40,
    description: '最多处理多少场比赛（每场 2 次 raw 请求：lineups + events）',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  maxMatches?: number;

  @ApiPropertyOptional({
    example: 400,
    description: '每场拉取后的间隔（毫秒），降低 GitHub 限流风险',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(30_000)
  delayMs?: number;

  @ApiPropertyOptional({
    example: 4000,
    description:
      '写入 raw JSON 时 events 最大条数；0 表示不请求 events（仅 lineups + 赛程元数据）',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50_000)
  maxEventsStored?: number;

  @ApiPropertyOptional({
    description:
      '为 true 时：无法在库内关联到 `Match` 则跳过（旧行为）。默认 false：无关联则新建 `Team`（`sb-t-*`）与 `Match`（`sb-m-*`）再写 `MatchFacts`。',
  })
  @IsOptional()
  @IsBoolean()
  skipCreateMatch?: boolean;
}

/** StatsBomb `competition_id` → 本地 `Competition.code`（见 `data/competitions.json`） */
export class StatsbombMappingEntryDto {
  @ApiProperty({ example: 11, description: 'StatsBomb competition_id（与 matches/{id}/… 目录名一致）' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  sbCompetitionId!: number;

  @ApiProperty({ example: 'PD', description: '库内 Competition.code' })
  @IsString()
  competitionCode!: string;
}

/**
 * 按 README 从 `competitions.json` 选多对 (competition_id, season_id) 批量入库（或 dryRun 审计）。
 * 建议分多批：`maxPairs` 控制本任务处理多少行，避免 GitHub 限流。
 */
export class StatsbombBatchIngestDto {
  @ApiPropertyOptional({
    enum: ['BIG5_EURO', 'ALL_MAPPED'],
    description:
      '一键内置映射：BIG5_EURO = 五大联赛+欧冠+欧联；ALL_MAPPED = 再含世界杯等（见 `statsbomb-auto-map.constant`）。与 mappings 同时传时 **preset 优先**。',
  })
  @IsOptional()
  @IsIn(['BIG5_EURO', 'ALL_MAPPED'])
  preset?: 'BIG5_EURO' | 'ALL_MAPPED';

  @ApiPropertyOptional({
    type: [StatsbombMappingEntryDto],
    description:
      '未使用 preset 时必填。例如西甲 11→PD、英超 2→PL；只处理目录中 competition_id 出现在此映射里的行',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatsbombMappingEntryDto)
  mappings?: StatsbombMappingEntryDto[];

  @ApiPropertyOptional({
    description: '仅处理这些 StatsBomb competition_id（仍须出现在 mappings 或 preset 映射中）',
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  competitionIdsAllow?: number[];

  @ApiPropertyOptional({ description: '仅处理这些 season_id' })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  seasonIdsAllow?: number[];

  @ApiPropertyOptional({
    example: 12,
    description: '本任务最多处理多少条目录行（每行一季 = 一次完整 ingest）',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  maxPairs?: number;

  @ApiPropertyOptional({ example: 40, description: '每个 season 文件内最多处理多少场比赛' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  maxMatchesPerPair?: number;

  @ApiPropertyOptional({ example: 400 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(30_000)
  delayMs?: number;

  @ApiPropertyOptional({
    example: 800,
    description: '两季文件之间的间隔（毫秒），降低限流',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(120_000)
  delayBetweenPairsMs?: number;

  @ApiPropertyOptional({ example: 4000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50_000)
  maxEventsStored?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  skipCreateMatch?: boolean;

  @ApiPropertyOptional({
    description: 'true：不写库，只返回计划与 catalog 汇总；可选配合 includeMatchCountsInDryRun',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({ description: 'dryRun 时对计划内前若干季拉 matches 文件只统计场次数' })
  @IsOptional()
  @IsBoolean()
  includeMatchCountsInDryRun?: boolean;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  dryRunProbeLimit?: number;

  @ApiPropertyOptional({ example: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(15_000)
  dryRunProbeDelayMs?: number;

  @ApiPropertyOptional({
    description: '覆盖默认 `STATS_BOMB_OPEN_DATA_BASE_URL`',
  })
  @IsOptional()
  @IsString()
  baseUrl?: string;
}

export class OpenFootballIngestDto {
  @ApiProperty({ example: 'en.1' })
  @IsString()
  leagueKey!: string;

  @ApiProperty({ example: 'PL' })
  @IsString()
  competitionCode!: string;

  @ApiPropertyOptional({ example: '2024-25' })
  @IsOptional()
  @IsString()
  seasonFolder?: string;

  @ApiPropertyOptional({
    description: '覆盖默认 GitHub raw URL',
  })
  @IsOptional()
  @IsString()
  url?: string;
}

export class FdPlayerSquadsIngestDto {
  @ApiPropertyOptional({
    example: ['PL', 'PD'],
    description: 'football-data 赛事 code；默认五大联赛+欧冠',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  codes?: string[];

  @ApiPropertyOptional({
    example: 900,
    description: '每支球队 GET /teams/{id} 前的间隔（毫秒），减轻 429',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(60_000)
  delayBetweenTeamMs?: number;

  @ApiPropertyOptional({
    example: 350,
    description: '开启 enrichPerson 时，每名球员 person/matches 请求之间的间隔（毫秒）',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(60_000)
  delayBetweenPersonMs?: number;

  @ApiPropertyOptional({
    description:
      '为每名球员额外请求 GET /persons/{id} 与 /persons/{id}/matches（配额与耗时显著增加）',
  })
  @IsOptional()
  @IsBoolean()
  enrichPerson?: boolean;

  @ApiPropertyOptional({
    description: '是否用 /teams/{id} 顶层字段更新 Team 的 venue / website / founded',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  updateTeamMeta?: boolean;

  @ApiPropertyOptional({
    description:
      '是否拉取主教练 GET /persons/{id}、/persons/{id}/matches，并写入 Team.coachProfile（含可选场次阵型摘录）',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  enrichCoach?: boolean;

  @ApiPropertyOptional({
    example: 5,
    description:
      'enrichCoach 为 true 时，对教练近期比赛列表中前 N 场再请求 GET /matches/{id} 以摘录 formation / lineup（0～12）',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(12)
  coachMatchDetailSample?: number;
}

export class ApiFootballFixturesIngestDto {
  @ApiPropertyOptional({
    example: ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL', 'EL', 'UECL'],
    description:
      '本地 Competition.code；默认五大联赛 + 欧冠/欧联/欧协。赛季为起始年（如 2024-25 → 2024）。免费版常见仅允许 2022–2024，以 API 返回为准。',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  codes?: string[];

  @ApiProperty({
    example: 2024,
    description: 'API-Football 赛季起始年；免费版勿用超出套餐的年份',
  })
  @Type(() => Number)
  @IsNumber()
  season!: number;

  @ApiPropertyOptional({
    example: 1350,
    description: '请求间隔（毫秒），免费版建议 ≥1200 以降低 429 风险',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000)
  delayBetweenRequestsMs?: number;

  @ApiPropertyOptional({
    example: 40,
    description: '每个联赛 fixtures 列表最大分页数（每页通常 10 场）',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  maxPagesPerLeague?: number;
}

export class ApiFootballSquadsIngestDto {
  @ApiPropertyOptional({
    example: ['PL', 'PD'],
    description: '须已跑过 API-Football fixtures，使库内存在 af-t-* 球队行',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  codes?: string[];

  @ApiProperty({
    example: 2024,
    description: '与 fixtures 一致；免费版常见 2022–2024',
  })
  @Type(() => Number)
  @IsNumber()
  season!: number;

  @ApiPropertyOptional({ example: 1350 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000)
  delayBetweenRequestsMs?: number;

  @ApiPropertyOptional({
    example: 24,
    description: '每个联赛最多处理多少支球队（免费版控制请求量）',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  maxTeamsPerLeague?: number;
}

export class ApiFootballMatchFactsBatchDto {
  @ApiPropertyOptional({
    description: '本地 Competition.id（cuid）；不传则在全库筛选 externalId 前缀 af-f-',
  })
  @IsOptional()
  @IsString()
  competitionId?: string;

  @ApiPropertyOptional({
    enum: ['FINISHED', 'SCHEDULED', 'LIVE'],
    description: '默认 FINISHED（赛后回填）；也可拉未开赛/进行中的可用数据',
  })
  @IsOptional()
  @IsIn(['FINISHED', 'SCHEDULED', 'LIVE'])
  status?: 'FINISHED' | 'SCHEDULED' | 'LIVE';

  @ApiPropertyOptional({ example: 40, description: '最多处理多少场比赛', default: 40 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  maxMatches?: number;

  @ApiPropertyOptional({
    example: 800,
    description: '每场之间的间隔（毫秒），控制 api-sports 配额',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(30_000)
  delayBetweenMatchesMs?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'true 时跳过已写满 lineups/events/teamStats 的 FINISHED 场次（幂等）',
  })
  @IsOptional()
  onlyMissing?: boolean;

  @ApiPropertyOptional({
    example: 30,
    description: '仅处理开球时间在最近 N 天内的比赛',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(365)
  lookbackDays?: number;

  @ApiPropertyOptional({
    description: 'true 时强制四接口全量拉取（忽略 onlyMissing）',
  })
  @IsOptional()
  force?: boolean;
}

export class ApiFootballMatchFactsCoverageQueryDto {
  @ApiPropertyOptional({ description: '本地 Competition.id（cuid）' })
  @IsOptional()
  @IsString()
  competitionId?: string;

  @ApiPropertyOptional({
    enum: ['FINISHED', 'SCHEDULED', 'LIVE'],
    default: 'FINISHED',
  })
  @IsOptional()
  @IsIn(['FINISHED', 'SCHEDULED', 'LIVE'])
  status?: 'FINISHED' | 'SCHEDULED' | 'LIVE';

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  sample?: number;

  @ApiPropertyOptional({ example: 30, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(365)
  lookbackDays?: number;
}

export class ApiFootballPreMatchSnapshotBatchDto {
  @ApiPropertyOptional({ description: '本地 Competition.id' })
  @IsOptional()
  @IsString()
  competitionId?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  maxMatches?: number;

  @ApiPropertyOptional({ example: 900 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(30_000)
  delayBetweenMatchesMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  force?: boolean;
}

export class ApiFootballOddsCaptureBatchDto {
  @ApiPropertyOptional({ description: '单场 matchId；不传则按 competition 批量' })
  @IsOptional()
  @IsString()
  matchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  competitionId?: string;

  @ApiProperty({ enum: ['T24', 'T1', 'LIVE'] })
  @IsIn(['T24', 'T1', 'LIVE'])
  phase!: 'T24' | 'T1' | 'LIVE';

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  maxMatches?: number;

  @ApiPropertyOptional({ example: 800 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(30_000)
  delayBetweenMatchesMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  force?: boolean;
}

export class PredictionInputCoverageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  competitionId?: string;

  @ApiPropertyOptional({ enum: ['FINISHED', 'SCHEDULED', 'LIVE'], default: 'SCHEDULED' })
  @IsOptional()
  @IsIn(['FINISHED', 'SCHEDULED', 'LIVE'])
  status?: 'FINISHED' | 'SCHEDULED' | 'LIVE';

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  sample?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(90)
  lookbackDays?: number;
}

export class PredictionGradingBatchDto {
  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  maxMatches?: number;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(365)
  lookbackDays?: number;
}

export class PredictionGradingSummaryQueryDto {
  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  sample?: number;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(365)
  lookbackDays?: number;
}

export class StructureRawPayloadDto {
  @ApiProperty({ description: '原始文本 / 爬虫粘贴内容' })
  @IsString()
  rawText!: string;

  @ApiPropertyOptional({ description: '辅助提示（联赛、场次等）' })
  @IsOptional()
  @IsString()
  hint?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  maxAttempts?: number;
}
