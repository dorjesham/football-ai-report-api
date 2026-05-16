import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamFollowService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertWc2026NationalTeam(teamId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, externalId: { startsWith: 'wc26-' } },
    });
    if (!team) {
      throw new NotFoundException(
        'Team not found or not a 2026 World Cup national team',
      );
    }
    return team;
  }

  async listFollowed(userId: string) {
    const rows = await this.prisma.userTeamFollow.findMany({
      where: { userId },
      include: {
        team: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      followId: r.id,
      createdAt: r.createdAt.toISOString(),
      team: {
        id: r.team.id,
        externalId: r.team.externalId,
        nameCn: r.team.nameCn,
        nameEn: r.team.nameEn,
        shortName: r.team.shortName,
        logoUrl: r.team.logoUrl,
        wcGroup: r.team.wcGroup,
        country: r.team.country,
      },
    }));
  }

  async follow(userId: string, teamId: string) {
    await this.assertWc2026NationalTeam(teamId);
    try {
      await this.prisma.userTeamFollow.create({
        data: { userId, teamId },
      });
    } catch (e: unknown) {
      if (
        e &&
        typeof e === 'object' &&
        'code' in e &&
        (e as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException('Already following this team');
      }
      throw e;
    }
    return { ok: true, teamId };
  }

  async unfollow(userId: string, teamId: string) {
    await this.prisma.userTeamFollow.deleteMany({
      where: { userId, teamId },
    });
    return { ok: true, teamId };
  }

  async isFollowing(userId: string, teamId: string) {
    const n = await this.prisma.userTeamFollow.count({
      where: { userId, teamId },
    });
    return { teamId, following: n > 0 };
  }
}
