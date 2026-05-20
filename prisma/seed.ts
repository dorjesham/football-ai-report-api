import { PrismaClient, UserRole, DataSourceType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  DEFAULT_TOURNAMENTS,
  SEED_COMPETITIONS,
  SEED_SEASONS,
} from './seed-catalog';

/**
 * 最小种子：联赛目录 + 赛季 + 管理员 + AF Provider 映射。
 * 不写入 Match / Team / Player / 占位赛程。数据请用管理端一键入库。
 */
const prisma = new PrismaClient();

async function seedAdmin() {
  const openid = process.env.ADMIN_BOOTSTRAP_OPENID || 'admin_bootstrap_openid';
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@local.dev';
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'admin123456';
  const hash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { openid },
    create: {
      openid,
      email,
      username: 'admin',
      passwordHash: hash,
      nickname: '系统管理员',
      role: UserRole.ADMIN,
      membershipUntil: new Date(Date.now() + 86400000 * 400),
    },
    update: {
      email,
      passwordHash: hash,
      role: UserRole.ADMIN,
      nickname: '系统管理员',
    },
  });
  console.log(`Admin user: email=${email} (password from ADMIN_BOOTSTRAP_PASSWORD)`);
}

async function seedCatalog() {
  for (const row of DEFAULT_TOURNAMENTS) {
    await prisma.tournament.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        nameCn: row.nameCn,
        nameEn: row.nameEn,
        type: row.type,
        level: row.level,
        isGlobal: row.isGlobal ?? false,
        isActive: true,
      },
      update: {
        nameCn: row.nameCn,
        nameEn: row.nameEn,
        type: row.type,
        level: row.level,
        isGlobal: row.isGlobal ?? false,
        isActive: true,
      },
    });
  }

  const seasonByCode: Record<string, string> = {};
  for (const s of SEED_SEASONS) {
    const row = await prisma.season.upsert({
      where: { code: s.code },
      create: {
        code: s.code,
        name: s.name,
        year: s.year,
        isCurrent: s.isCurrent,
      },
      update: { isCurrent: s.isCurrent, year: s.year },
    });
    seasonByCode[s.code] = row.id;
  }

  for (const c of SEED_COMPETITIONS) {
    const tournament = await prisma.tournament.findUniqueOrThrow({
      where: { code: c.tournamentCode },
    });
    const seasonId = seasonByCode[c.seasonCode];
    if (!seasonId) throw new Error(`Missing season ${c.seasonCode}`);

    await prisma.competition.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        tournamentId: tournament.id,
        seasonId,
        code: c.code,
        nameCn: c.nameCn,
        nameEn: c.nameEn,
        apiSportsLeagueId: c.apiSportsLeagueId,
        dataSource: DataSourceType.API_FOOTBALL,
        level: c.level ?? 'TIER_1',
      },
      update: {
        tournamentId: tournament.id,
        seasonId,
        code: c.code,
        nameCn: c.nameCn,
        nameEn: c.nameEn,
        apiSportsLeagueId: c.apiSportsLeagueId,
        dataSource: DataSourceType.API_FOOTBALL,
      },
    });

    await prisma.dataProviderMapping.upsert({
      where: { id: `seed-dpm-af-${c.code}` },
      create: {
        id: `seed-dpm-af-${c.code}`,
        provider: DataSourceType.API_FOOTBALL,
        tournamentId: tournament.id,
        competitionId: c.id,
        providerCompetitionCode: c.code,
        providerCompetitionId: String(c.apiSportsLeagueId),
        providerSeasonCode: c.seasonCode === '2026-wc' ? '2026' : '2025',
      },
      update: {
        competitionId: c.id,
        providerCompetitionCode: c.code,
        providerCompetitionId: String(c.apiSportsLeagueId),
      },
    });
  }
}

async function main() {
  await seedAdmin();
  await seedCatalog();
  console.log('Seed completed (catalog only — no matches).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
