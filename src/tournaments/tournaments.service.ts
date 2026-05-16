import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TournamentType } from '@prisma/client';
import { CompetitionsService } from '../competitions/competitions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { stableQueryHash } from '../common/utils/stable-query-hash';
import { DEFAULT_TOURNAMENTS } from '../common/constants/default-tournaments';

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly competitions: CompetitionsService,
  ) {}

  private tournamentsTtl(): number {
    return this.config.get<number>('cacheTournamentsTtlSec') ?? 30;
  }

  async findAll(query: { type?: TournamentType; isActive?: boolean }) {
    const key = `tournaments:list:${stableQueryHash(query as Record<string, unknown>)}`;
    const ttl = this.tournamentsTtl();
    const hit = await this.redis.getJson<unknown[]>(key);
    if (hit) return hit;

    const where: Prisma.TournamentWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    const rows = await this.prisma.tournament.findMany({
      where,
      orderBy: { code: 'asc' },
    });
    await this.redis.setJson(key, rows, ttl);
    return rows;
  }

  async findByCode(code: string) {
    const key = `tournaments:code:${code}`;
    const ttl = this.tournamentsTtl();
    const hit = await this.redis.getJson<Record<string, unknown>>(key);
    if (hit) return hit as never;

    const t = await this.prisma.tournament.findUnique({ where: { code } });
    if (!t) throw new NotFoundException('Tournament not found');
    await this.redis.setJson(key, t, ttl);
    return t;
  }

  async competitionsByCode(code: string) {
    const key = `tournaments:comps:${code}`;
    const ttl = this.tournamentsTtl();
    const hit = await this.redis.getJson<unknown[]>(key);
    if (hit) return hit;

    await this.findByCode(code);
    const rows = await this.prisma.competition.findMany({
      where: { tournament: { code } },
      include: { season: true, tournament: true },
      orderBy: { nameCn: 'asc' },
    });
    await this.redis.setJson(key, rows, ttl);
    return rows;
  }

  async matchesByCode(code: string) {
    const key = `tournaments:matches:${code}`;
    const ttl = this.tournamentsTtl();
    const hit = await this.redis.getJson<unknown[]>(key);
    if (hit) return hit;

    await this.findByCode(code);
    const rows = await this.prisma.match.findMany({
      where: { tournament: { code } },
      include: { homeTeam: true, awayTeam: true, competition: true },
      orderBy: { kickoffTime: 'asc' },
    });
    await this.redis.setJson(key, rows, ttl);
    return rows;
  }

  /**
   * 按赛事 code 解析下属 `Competition`（优先 `code=WC`），再聚合积分榜。
   */
  async standingsByTournamentCode(tournamentCode: string, group?: string) {
    await this.findByCode(tournamentCode);
    const comps = await this.prisma.competition.findMany({
      where: { tournament: { code: tournamentCode } },
      orderBy: { nameCn: 'asc' },
      select: { id: true, code: true, nameCn: true },
    });
    if (!comps.length) {
      throw new NotFoundException('No competition under this tournament');
    }
    const wc = comps.find((c) => c.code === 'WC') ?? comps[0]!;
    return this.competitions.computeStandings(wc.id, group);
  }

  async seedDefaults() {
    for (const row of DEFAULT_TOURNAMENTS) {
      await this.prisma.tournament.upsert({
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
        },
      });
    }
    return { seeded: DEFAULT_TOURNAMENTS.length };
  }
}
