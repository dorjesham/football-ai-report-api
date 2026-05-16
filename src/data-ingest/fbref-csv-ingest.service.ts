import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  headerToFieldKey,
  normalizeClubKey,
  normalizePlayerKey,
  parseFbrefPlayerStatsTable,
  parseIntCell,
  parseNumericCell,
} from './fbref-csv-parse';

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function mergePlayerProfileFbref(
  prev: Prisma.JsonValue | null | undefined,
  seasonTag: string,
  seasonPayload: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base =
    prev && typeof prev === 'object' && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : {};
  const prevFbref = asRecord(base.fbref) ?? {};
  const seasons = asRecord(prevFbref.seasons) ?? {};
  seasons[seasonTag] = seasonPayload;
  base.fbref = { ...prevFbref, seasons };
  return base as Prisma.InputJsonValue;
}

type TeamWithPlayers = {
  id: string;
  nameEn: string;
  nameCn: string;
  shortName: string | null;
  players: Array<{
    id: string;
    nameEn: string;
    nameCn: string;
    shirtNumber: number | null;
    profile: Prisma.JsonValue | null;
  }>;
};

function findHeaderIndices(headers: string[]) {
  const lower = headers.map((h) => h.replace(/^\uFEFF/, '').trim().toLowerCase());
  const playerIdx = lower.findIndex((h) => h === 'player');
  const squadIdx = lower.findIndex((h) => h === 'squad' || h === 'team');
  const minIdx = lower.findIndex((h) => h === 'min');
  return { playerIdx, squadIdx, minIdx };
}

function matchTeamForSquad(squad: string, teams: TeamWithPlayers[]): TeamWithPlayers | null {
  const key = normalizeClubKey(squad);
  if (!key) return null;
  let best: { team: TeamWithPlayers; score: number } | null = null;
  for (const t of teams) {
    const a = normalizeClubKey(t.nameEn);
    const b = normalizeClubKey(t.nameCn);
    const s = t.shortName ? normalizeClubKey(t.shortName) : '';
    let score = 0;
    if (key === a || key === b) score = 100;
    else if (key.length >= 4 && (a.includes(key) || key.includes(a))) score = 82;
    else if (key.length >= 4 && (b.includes(key) || key.includes(b))) score = 78;
    else if (s && key.length >= 4 && (s.includes(key) || key.includes(s))) score = 72;
    if (score > 0 && (!best || score > best.score)) best = { team: t, score };
  }
  if (!best || best.score < 70) return null;
  return best.team;
}

function matchPlayerInTeam(
  csvPlayer: string,
  teamPlayers: TeamWithPlayers['players'],
): (typeof teamPlayers)[0] | null {
  const k = normalizePlayerKey(csvPlayer);
  if (!k) return null;
  let fuzzy: (typeof teamPlayers)[0] | null = null;
  for (const p of teamPlayers) {
    const en = normalizePlayerKey(p.nameEn);
    const cn = normalizePlayerKey(p.nameCn);
    if (en === k || cn === k) return p;
  }
  for (const p of teamPlayers) {
    const en = normalizePlayerKey(p.nameEn);
    if (!en) continue;
    if (en.includes(k) || k.includes(en)) {
      if (!fuzzy || en.length < normalizePlayerKey(fuzzy.nameEn).length) fuzzy = p;
    }
  }
  return fuzzy;
}

@Injectable()
export class FbrefCsvIngestService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * FBref「球员标准统计」等 CSV：需含 Player + Squad（或 Team）列。
   * 按 `competitionCode` 下曾出现过的主客队并集匹配球队，再按姓名归一化匹配球员；
   * 写入 `Player.profile.fbref.seasons[seasonTag]` 与 `fbrefStatsSyncedAt` / `fbrefSeasonTag` / `fbrefMinutes`。
   */
  async ingestPlayerStatsCsv(opts: {
    csvText: string;
    competitionCode: string;
    seasonTag: string;
    originalFileName?: string;
  }): Promise<Record<string, unknown>> {
    const seasonTag = opts.seasonTag.trim();
    if (!seasonTag) throw new BadRequestException('seasonTag 不能为空');
    const code = opts.competitionCode.trim();
    if (!code) throw new BadRequestException('competitionCode 不能为空');

    let table;
    try {
      table = parseFbrefPlayerStatsTable(opts.csvText);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : String(e));
    }

    const comp = await this.prisma.competition.findFirst({
      where: { code },
    });
    if (!comp) {
      throw new NotFoundException(`本地缺少 Competition.code=${code}`);
    }

    const matchRows = await this.prisma.match.findMany({
      where: { competitionId: comp.id },
      select: { homeTeamId: true, awayTeamId: true },
    });
    const teamIdSet = new Set<string>();
    for (const m of matchRows) {
      teamIdSet.add(m.homeTeamId);
      teamIdSet.add(m.awayTeamId);
    }
    const teamIds = [...teamIdSet];
    if (teamIds.length === 0) {
      throw new BadRequestException(
        `赛事 ${code} 下尚无比赛记录，无法推断球队集合；请先同步赛程或检查 code。`,
      );
    }

    const teams = await this.prisma.team.findMany({
      where: { id: { in: teamIds } },
      include: {
        players: {
          select: { id: true, nameEn: true, nameCn: true, shirtNumber: true, profile: true },
        },
      },
    });

    const { playerIdx, squadIdx, minIdx } = findHeaderIndices(table.headers);
    if (playerIdx < 0 || squadIdx < 0) {
      throw new BadRequestException('表头缺少 Player 或 Squad/Team 列');
    }

    const fieldKeys = table.headers.map((h) => headerToFieldKey(h));
    const now = new Date().toISOString();
    let updatedPlayers = 0;
    let skippedNoTeam = 0;
    let skippedNoPlayer = 0;
    const warnings: string[] = [];

    for (let ri = 0; ri < table.dataRows.length; ri++) {
      const cells = table.dataRows[ri];
      const squad = (cells[squadIdx] ?? '').trim();
      const playerName = (cells[playerIdx] ?? '').trim();
      if (!squad || !playerName) continue;

      const team = matchTeamForSquad(squad, teams);
      if (!team) {
        skippedNoTeam += 1;
        if (warnings.length < 40) {
          warnings.push(`第 ${ri + 1} 行：未匹配球队 Squad="${squad}"`);
        }
        continue;
      }

      const player = matchPlayerInTeam(playerName, team.players);
      if (!player) {
        skippedNoPlayer += 1;
        if (warnings.length < 60) {
          warnings.push(
            `第 ${ri + 1} 行：球队 ${team.nameEn} 下未找到球员 "${playerName}"`,
          );
        }
        continue;
      }

      const raw: Record<string, string> = {};
      const typed: Record<string, string | number | null> = {};
      for (let ci = 0; ci < table.headers.length; ci++) {
        const origH = table.headers[ci] ?? `Col${ci}`;
        let key = fieldKeys[ci] ?? `col${ci}`;
        if (Object.prototype.hasOwnProperty.call(typed, key)) key = `${key}_${ci}`;
        const cell = cells[ci] ?? '';
        raw[origH] = cell;
        const t = cell.trim();
        if (!t) {
          typed[key] = null;
          continue;
        }
        const asNum = parseNumericCell(cell);
        typed[key] = asNum != null ? asNum : t;
      }

      const minParsed = minIdx >= 0 ? parseIntCell(cells[minIdx] ?? '') : null;

      const seasonPayload: Record<string, unknown> = {
        source: 'fbref-csv',
        ingestedAt: now,
        fileName: opts.originalFileName ?? null,
        competitionCode: code,
        headers: table.headers,
        raw,
        stats: typed,
      };

      const mergedProfile = mergePlayerProfileFbref(
        player.profile,
        seasonTag,
        seasonPayload,
      );

      await this.prisma.player.update({
        where: { id: player.id },
        data: {
          profile: mergedProfile,
          fbrefStatsSyncedAt: new Date(),
          fbrefSeasonTag: seasonTag,
          fbrefMinutes: minParsed,
        },
      });
      updatedPlayers += 1;
    }

    return {
      ok: true,
      competitionCode: code,
      seasonTag,
      headerRowIndex: table.headerRowIndex,
      dataRowCount: table.dataRows.length,
      teamsInScope: teams.length,
      updatedPlayers,
      skippedNoTeam,
      skippedNoPlayer,
      warnings,
    };
  }
}
