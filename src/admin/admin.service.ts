import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, OrderStatus, ReportStatus } from '@prisma/client';
import { WC2026_PROFILE_DETAIL_KEYS } from '../common/constants/wc2026-profile-detail.keys';
import { applyWc2026DetailPatchToProfile } from '../common/utils/wc2026-profile-detail-merge';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { CreateProviderMappingDto } from './dto/create-provider-mapping.dto';
import { UpdateWc2026TeamDetailDto } from './dto/update-wc2026-team-detail.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournaments: TournamentsService,
    private readonly config: ConfigService,
  ) {}

  async dashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      matchCount,
      todayMatches,
      featured,
      publishedReports,
      draftReports,
      userCount,
      orderCount,
      paidOrders,
    ] = await Promise.all([
      this.prisma.match.count(),
      this.prisma.match.count({
        where: { kickoffTime: { gte: today, lt: tomorrow } },
      }),
      this.prisma.match.count({ where: { isFeatured: true } }),
      this.prisma.aiReport.count({ where: { status: ReportStatus.PUBLISHED } }),
      this.prisma.aiReport.count({ where: { status: ReportStatus.DRAFT } }),
      this.prisma.user.count(),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: OrderStatus.PAID } }),
    ]);

    const revenue = await this.prisma.order.aggregate({
      where: { status: OrderStatus.PAID },
      _sum: { amount: true },
    });

    const lh = this.config.get<number>('autoIntelLookaheadHours') ?? 72;
    const lb = this.config.get<number>('autoIntelLookbackHours') ?? 12;
    const winUntil = Date.now() + lh * 3600_000;
    const winSince = Date.now() - lb * 3600_000;
    const intelGapMatches = await this.prisma.match.count({
      where: {
        status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
        activePredictionId: null,
        kickoffTime: { gte: new Date(winSince), lte: new Date(winUntil) },
      },
    });

    return {
      matchCount,
      todayMatches,
      featuredMatchCount: featured,
      publishedReports,
      draftReports,
      userCount,
      orderCount,
      paidOrderCount: paidOrders,
      revenueCents: revenue._sum.amount ?? 0,
      intelGapMatches,
      autoIntelLookaheadHours: lh,
      autoIntelLookbackHours: lb,
    };
  }

  seedTournaments() {
    return this.tournaments.seedDefaults();
  }

  listTournaments() {
    return this.prisma.tournament.findMany({ orderBy: { code: 'asc' } });
  }

  listCompetitions() {
    return this.prisma.competition.findMany({
      include: { tournament: true, season: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  listSeasons() {
    return this.prisma.season.findMany({ orderBy: { code: 'desc' } });
  }

  listMatches() {
    return this.prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true, competition: true },
      orderBy: { kickoffTime: 'desc' },
      take: 200,
    });
  }

  getMatch(id: string) {
    return this.prisma.match.findUnique({
      where: { id },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: true,
        season: true,
        tournament: true,
        teamSnapshots: { include: { team: true } },
        playerSnapshots: { include: { player: true, team: true } },
        refereeSnapshot: { include: { referee: true } },
        weatherSnapshot: true,
        activePrediction: true,
        playerIntelligence: { include: { player: true, team: true } },
        tacticalScenarios: true,
        fantasyAdvice: true,
        headToHead: true,
        socialGuide: true,
        aiReports: { orderBy: { createdAt: 'desc' } },
        sourceRecords: { orderBy: { fetchedAt: 'desc' }, take: 60 },
      },
    });
  }

  listOrders() {
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: true, match: true },
    });
  }

  listUnlocks() {
    return this.prisma.paymentUnlock.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  listSources(matchId?: string) {
    return this.prisma.sourceRecord.findMany({
      where: matchId ? { matchId } : undefined,
      orderBy: { fetchedAt: 'desc' },
      take: 200,
    });
  }

  listProviderMappings() {
    return this.prisma.dataProviderMapping.findMany({
      include: { tournament: true, competition: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  createProviderMapping(dto: CreateProviderMappingDto) {
    return this.prisma.dataProviderMapping.create({
      data: {
        provider: dto.provider,
        tournamentId: dto.tournamentId,
        competitionId: dto.competitionId,
        providerCompetitionCode: dto.providerCompetitionCode,
        providerCompetitionId: dto.providerCompetitionId,
        providerSeasonCode: dto.providerSeasonCode,
      },
    });
  }

  listApiLogs(limit = 80) {
    return this.prisma.apiLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }

  /** 更新世界杯种子队展示字段（`wc26-*`）；供 Admin JSON 与 AdminView 表单共用。 */
  async patchWc2026TeamDetail(teamId: string, dto: UpdateWc2026TeamDetailDto) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, externalId: { startsWith: 'wc26-' } },
    });
    if (!team) {
      throw new NotFoundException('WC2026 national team not found');
    }

    const d = dto as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of WC2026_PROFILE_DETAIL_KEYS) {
      if (d[k] !== undefined) patch[k] = d[k];
    }

    const newProfile = applyWc2026DetailPatchToProfile(
      team.wc2026Profile,
      patch,
    );

    return this.prisma.team.update({
      where: { id: teamId },
      data: {
        wc2026Profile: newProfile as object,
        ...(dto.founded !== undefined ? { founded: dto.founded } : {}),
      },
      select: {
        id: true,
        nameCn: true,
        externalId: true,
        founded: true,
        wc2026Profile: true,
      },
    });
  }
}
