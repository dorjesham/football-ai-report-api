import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Prisma, PrismaClient } from '@prisma/client';
import { DataSourceType } from '@prisma/client';
import {
  mergeWc2026ProfileWithExisting,
  pickWc2026DetailFromOverride,
} from '../src/common/utils/wc2026-profile-detail-merge';

type WcJsonTeam = {
  code: string;
  nameCn: string;
  nameEn: string;
  group: string;
  confederation: string;
  flagUrl: string;
  fifaRanking?: Record<string, unknown>;
  worldFootballElo?: Record<string, unknown>;
  recentInternational?: Record<string, unknown>;
};

type WcJsonFile = {
  meta: Record<string, unknown>;
  teams: WcJsonTeam[];
};

function loadWc2026DetailOverrides(): Record<string, Record<string, unknown>> {
  const p = path.join(__dirname, '..', 'wc2026_team_detail_overrides.json');
  if (!fs.existsSync(p)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as {
      byCode?: Record<string, Record<string, unknown>>;
    };
    return raw.byCode ?? {};
  } catch {
    return {};
  }
}

/**
 * Upsert 48 支 2026 世界杯球队（externalId = wc26-{TLA}），写入 wcGroup / wc2026Profile / logoUrl / eloRating。
 * 可选读取 `wc2026_team_detail_overrides.json`；若某展示键在文件中未出现，则保留库内已有值（便于管理端 PATCH 后不被 seed 覆盖）。
 */
export async function importWorldCup2026Teams(
  prisma: PrismaClient,
  competitionId: string,
): Promise<{ upserted: number }> {
  const jsonPath = path.join(__dirname, '..', 'worldcup2026_teams.json');
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(raw) as WcJsonFile;
  const overrides = loadWc2026DetailOverrides();

  let n = 0;
  for (const t of data.teams) {
    const externalId = `wc26-${t.code}`;
    const elo = t.worldFootballElo?.rating;
    const eloRating =
      typeof elo === 'number' && Number.isFinite(elo) ? Math.round(elo) : 1500;

    const existing = await prisma.team.findUnique({
      where: { externalId },
      select: { wc2026Profile: true, founded: true },
    });

    const ov = overrides[t.code] ?? {};
    const fileExtras = pickWc2026DetailFromOverride(ov);

    const baseProfile = {
      code: t.code,
      competitionId,
      confederation: t.confederation,
      flagUrl: t.flagUrl,
      fifaRanking: t.fifaRanking ?? null,
      worldFootballElo: t.worldFootballElo ?? null,
      recentInternational: t.recentInternational ?? null,
      bundleMeta: data.meta,
    } as Record<string, unknown>;

    const profile = mergeWc2026ProfileWithExisting(
      baseProfile,
      fileExtras,
      existing?.wc2026Profile,
    ) as Prisma.InputJsonValue;

    const foundedFromFile =
      typeof ov.founded === 'number' && Number.isFinite(ov.founded)
        ? Math.round(ov.founded)
        : undefined;
    const foundedToWrite =
      foundedFromFile !== undefined
        ? foundedFromFile
        : existing?.founded ?? null;

    await prisma.team.upsert({
      where: { externalId },
      create: {
        externalId,
        nameCn: t.nameCn,
        nameEn: t.nameEn,
        shortName: t.code,
        logoUrl: t.flagUrl,
        country: t.confederation,
        wcGroup: t.group,
        wc2026Profile: profile,
        eloRating,
        dataSource: DataSourceType.FIFA,
        founded: foundedToWrite ?? null,
      },
      update: {
        nameCn: t.nameCn,
        nameEn: t.nameEn,
        shortName: t.code,
        logoUrl: t.flagUrl,
        country: t.confederation,
        wcGroup: t.group,
        wc2026Profile: profile,
        eloRating,
        dataSource: DataSourceType.FIFA,
        founded: foundedToWrite ?? null,
      },
    });
    n += 1;
  }

  return { upserted: n };
}
