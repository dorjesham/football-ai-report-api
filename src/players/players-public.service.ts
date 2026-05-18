import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mapPlayerMarketValueFields } from './player-market.util';

@Injectable()
export class PlayersPublicService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(playerId: string) {
    const p = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        team: {
          select: {
            id: true,
            nameCn: true,
            nameEn: true,
            logoUrl: true,
            country: true,
            powerRating: true,
          },
        },
      },
    });
    if (!p) throw new NotFoundException('Player not found');
    const profileKeys =
      p.profile && typeof p.profile === 'object' && !Array.isArray(p.profile) ?
        Object.keys(p.profile as Record<string, unknown>).slice(0, 24)
      : [];
    return {
      id: p.id,
      nameCn: p.nameCn,
      nameEn: p.nameEn,
      position: p.position,
      shirtNumber: p.shirtNumber,
      nationality: p.nationality,
      avatarUrl: p.avatarUrl,
      externalId: p.externalId,
      dataSource: p.dataSource,
      fantasyPrice: p.fantasyPrice,
      fantasySource: p.fantasySource,
      powerRating: p.powerRating,
      powerRatingMeta: p.powerRatingMeta,
      fbrefMinutes: p.fbrefMinutes,
      fbrefSeasonTag: p.fbrefSeasonTag,
      profileFieldKeys: profileKeys,
      ...mapPlayerMarketValueFields(p.profile),
      team: p.team,
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
