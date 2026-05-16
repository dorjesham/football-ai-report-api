import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import {
  auditMatchesByFdExternalId,
  auditWcScheduleVsFootballData,
  type FdExternalIdAuditReport,
  type WcPairAuditReport,
} from './schedule-audit';

function stripEnvQuotes(v: string | undefined): string {
  if (v == null || v === '') return '';
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

@Injectable()
export class ScheduleAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private fdHttp() {
    const key = stripEnvQuotes(this.config.get<string>('footballDataApiKey'));
    if (!key) {
      throw new BadRequestException('FOOTBALL_DATA_API_KEY missing');
    }
    const baseURL =
      stripEnvQuotes(this.config.get<string>('footballDataBaseUrl')) ||
      'https://api.football-data.org/v4';
    return axios.create({
      baseURL,
      timeout: 30000,
      headers: { 'X-Auth-Token': key },
    });
  }

  async auditWcPairs(opts: {
    competitionId: string;
    fdCode: string;
    dateFrom: string;
    dateTo: string;
    kickoffToleranceMin: number;
  }): Promise<WcPairAuditReport> {
    return auditWcScheduleVsFootballData({
      prisma: this.prisma,
      http: this.fdHttp(),
      ...opts,
    });
  }

  async auditByFdMatchExternalId(opts: {
    competitionId: string;
    kickoffToleranceMin: number;
  }): Promise<FdExternalIdAuditReport> {
    return auditMatchesByFdExternalId({
      prisma: this.prisma,
      http: this.fdHttp(),
      ...opts,
    });
  }
}
