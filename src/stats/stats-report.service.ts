import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeMatchDataOverview, type MatchDataOverview } from './match-data-overview';

@Injectable()
export class StatsReportService {
  constructor(private readonly prisma: PrismaService) {}

  getMatchDataOverview(): Promise<MatchDataOverview> {
    return computeMatchDataOverview(this.prisma);
  }
}
