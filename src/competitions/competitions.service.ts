import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus, Team } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { UpdateCompetitionDto } from './dto/update-competition.dto';

@Injectable()
export class CompetitionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: { tournamentId?: string; seasonId?: string }) {
    return this.prisma.competition.findMany({
      where: {
        tournamentId: filters.tournamentId,
        seasonId: filters.seasonId,
      },
      include: { tournament: true, season: true },
      orderBy: { nameCn: 'asc' },
    });
  }

  async findOne(id: string) {
    const c = await this.prisma.competition.findUnique({
      where: { id },
      include: { tournament: true, season: true },
    });
    if (!c) throw new NotFoundException('Competition not found');
    return c;
  }

  create(dto: CreateCompetitionDto) {
    return this.prisma.competition.create({
      data: {
        tournamentId: dto.tournamentId,
        seasonId: dto.seasonId,
        nameCn: dto.nameCn,
        nameEn: dto.nameEn,
        code: dto.code,
        country: dto.country,
        seasonName: dto.seasonName,
        level: dto.level,
        dataSource: dto.dataSource,
      },
    });
  }

  async update(id: string, dto: UpdateCompetitionDto) {
    await this.findOne(id);
    return this.prisma.competition.update({
      where: { id },
      data: dto,
    });
  }

  private async assertWorldCupCompetition(competitionId: string) {
    const comp = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      include: { tournament: true },
    });
    if (!comp) throw new NotFoundException('Competition not found');
    if (comp.code !== 'WC' && comp.tournament?.code !== 'FIFA_WC') {
      throw new BadRequestException(
        'Only FIFA World Cup competitions support this list',
      );
    }
    return comp;
  }

  private slimProfile(p: unknown): unknown {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return p;
    const o = { ...(p as Record<string, unknown>) };
    const ri = o.recentInternational;
    if (ri && typeof ri === 'object' && !Array.isArray(ri)) {
      const r = { ...(ri as Record<string, unknown>) };
      delete r.matches;
      o.recentInternational = r;
    }
    return o;
  }

  private mapWcTeamDto(r: Team, slim?: boolean) {
    return {
      id: r.id,
      externalId: r.externalId,
      nameCn: r.nameCn,
      nameEn: r.nameEn,
      shortName: r.shortName,
      logoUrl: r.logoUrl,
      country: r.country,
      wcGroup: r.wcGroup,
      founded: r.founded,
      eloRating: r.eloRating,
      wc2026Profile: slim ? this.slimProfile(r.wc2026Profile) : r.wc2026Profile,
    };
  }

  /**
   * 2026 世界杯 48 强（种子 externalId 前缀 `wc26-`）。
   * `?slim=1` 时省略 `recentInternational.matches` 以减小体积。
   */
  async listWorldCup2026Teams(competitionId: string, slim?: boolean) {
    await this.assertWorldCupCompetition(competitionId);

    const rows = await this.prisma.team.findMany({
      where: { externalId: { startsWith: 'wc26-' } },
      orderBy: [{ wcGroup: 'asc' }, { nameCn: 'asc' }],
    });

    return rows.map((r) => this.mapWcTeamDto(r, slim));
  }

  /** 单队详情（同一 payload 形状与列表项一致）；非 slim 时含完整 `recentInternational.matches`。 */
  async getWorldCup2026Team(
    competitionId: string,
    teamId: string,
    slim?: boolean,
  ) {
    await this.assertWorldCupCompetition(competitionId);
    const row = await this.prisma.team.findFirst({
      where: { id: teamId, externalId: { startsWith: 'wc26-' } },
    });
    if (!row) {
      throw new NotFoundException(
        'Team not found or not a 2026 World Cup national team',
      );
    }
    return this.mapWcTeamDto(row, slim);
  }

  /**
   * 该队在本届世界杯赛事实例下的正赛赛程（`Match` 表），与 `recentInternational` 历史窗无关。
   * 无赛程数据时返回空数组；主客队均带 `logoUrl` / `nameCn` 等同源字段。
   */
  async getWorldCup2026TeamSchedule(competitionId: string, teamId: string) {
    await this.assertWorldCupCompetition(competitionId);
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, externalId: { startsWith: 'wc26-' } },
    });
    if (!team) {
      throw new NotFoundException(
        'Team not found or not a 2026 World Cup national team',
      );
    }

    const matches = await this.prisma.match.findMany({
      where: {
        competitionId,
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffTime: 'asc' },
    });

    const schedule = matches.map((m) => {
      const isHome = m.homeTeamId === teamId;
      const opponent = isHome ? m.awayTeam : m.homeTeam;
      return {
        matchId: m.id,
        kickoffTime: m.kickoffTime.toISOString(),
        status: m.status,
        round: m.round,
        stage: m.stage,
        groupName: m.groupName,
        stadium: m.stadium,
        city: m.city,
        country: m.country,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        sideForTeam: isHome ? ('home' as const) : ('away' as const),
        opponent: {
          id: opponent.id,
          nameCn: opponent.nameCn,
          nameEn: opponent.nameEn,
          shortName: opponent.shortName,
          logoUrl: opponent.logoUrl,
          externalId: opponent.externalId,
        },
      };
    });

    return {
      competitionId,
      teamId,
      team: {
        id: team.id,
        nameCn: team.nameCn,
        shortName: team.shortName,
        logoUrl: team.logoUrl,
        wcGroup: team.wcGroup,
      },
      matches: schedule,
    };
  }

  /**
   * 根据已完赛场次聚合积分榜（胜 3 / 平 1 / 负 0）。仅统计 `FINISHED`。
   * `group` 与 `Match.groupName` 对齐（如世界杯小组赛 `A`）；不传则包含该杯赛下所有已完赛且带分组的场次。
   */
  async computeStandings(competitionId: string, group?: string) {
    await this.findOne(competitionId);
    const where = {
      competitionId,
      status: MatchStatus.FINISHED,
      ...(group?.trim() ? { groupName: group.trim() } : {}),
    };
    const matches = await this.prisma.match.findMany({
      where,
      select: {
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        groupName: true,
      },
    });
    type Agg = {
      teamId: string;
      played: number;
      wins: number;
      draws: number;
      losses: number;
      gf: number;
      ga: number;
    };
    const map = new Map<string, Agg>();
    const touch = (id: string): Agg => {
      if (!map.has(id)) {
        map.set(id, {
          teamId: id,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          gf: 0,
          ga: 0,
        });
      }
      return map.get(id)!;
    };
    for (const m of matches) {
      const hs = m.homeScore ?? 0;
      const as = m.awayScore ?? 0;
      const h = touch(m.homeTeamId);
      const a = touch(m.awayTeamId);
      h.played += 1;
      a.played += 1;
      h.gf += hs;
      h.ga += as;
      a.gf += as;
      a.ga += hs;
      if (hs > as) {
        h.wins += 1;
        a.losses += 1;
      } else if (hs < as) {
        a.wins += 1;
        h.losses += 1;
      } else {
        h.draws += 1;
        a.draws += 1;
      }
    }
    const teamIds = [...map.keys()];
    const teams = await this.prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, nameCn: true, nameEn: true, shortName: true, logoUrl: true, wcGroup: true },
    });
    const byId = new Map(teams.map((t) => [t.id, t]));
    const rows = [...map.values()].map((r) => ({
      teamId: r.teamId,
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalsFor: r.gf,
      goalsAgainst: r.ga,
      goalDifference: r.gf - r.ga,
      points: r.wins * 3 + r.draws,
      team: byId.get(r.teamId) ?? { id: r.teamId, nameCn: '', nameEn: null, shortName: null, logoUrl: null, wcGroup: null },
    }));
    rows.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
    return {
      competitionId,
      group: group?.trim() || null,
      source: 'aggregated_from_finished_matches' as const,
      rows,
    };
  }
}
