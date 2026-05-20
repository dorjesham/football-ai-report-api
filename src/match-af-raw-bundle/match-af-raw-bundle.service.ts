import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  availabilityFromValue,
  BUNDLE_TRACKED_FIELDS,
  type AfAvailabilityStatus,
  type BundleJsonField,
} from './af-availability.util';

@Injectable()
export class MatchAfRawBundleService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureBundle(matchId: string, fixtureId: number) {
    return this.prisma.matchAfRawBundle.upsert({
      where: { matchId },
      create: { matchId, fixtureId },
      update: { fixtureId },
    });
  }

  async getByMatchId(matchId: string) {
    return this.prisma.matchAfRawBundle.findUnique({ where: { matchId } });
  }

  /**
   * 成功写入字段；HTTP 失败时仅更新 lastError/availability，不覆盖已有 JSON。
   */
  async patchField(
    matchId: string,
    field: BundleJsonField,
    value: Prisma.InputJsonValue | null,
    meta: { syncStatus: 'success' | 'empty' | 'error'; errorMessage?: string },
  ) {
    const existing = await this.prisma.matchAfRawBundle.findUnique({
      where: { matchId },
    });
    if (!existing) return null;

    const availability = {
      ...((existing.availabilityJson as Record<string, AfAvailabilityStatus>) ?? {}),
    };
    const fetchedAt = {
      ...((existing.fetchedAtJson as Record<string, string>) ?? {}),
    };
    const lastError = {
      ...((existing.lastErrorJson as Record<string, string | null>) ?? {}),
    };

    const fieldKey = field.replace(/Json$/, '');
    const now = new Date().toISOString();

    if (meta.syncStatus === 'error') {
      availability[fieldKey] = 'error';
      lastError[fieldKey] = meta.errorMessage ?? 'sync failed';
      return this.prisma.matchAfRawBundle.update({
        where: { matchId },
        data: {
          availabilityJson: availability as Prisma.InputJsonValue,
          lastErrorJson: lastError as Prisma.InputJsonValue,
        },
      });
    }

    const shouldWriteValue = meta.syncStatus === 'success' || meta.syncStatus === 'empty';
    const data: Prisma.MatchAfRawBundleUpdateInput = {
      availabilityJson: availability as Prisma.InputJsonValue,
      fetchedAtJson: fetchedAt as Prisma.InputJsonValue,
      lastErrorJson: lastError as Prisma.InputJsonValue,
      syncedAt: new Date(),
    };

    if (shouldWriteValue) {
      availability[fieldKey] = availabilityFromValue(value, null);
      fetchedAt[fieldKey] = now;
      lastError[fieldKey] = null;
      (data as Record<string, unknown>)[field] = value;
      data.availabilityJson = availability as Prisma.InputJsonValue;
      data.fetchedAtJson = fetchedAt as Prisma.InputJsonValue;
      data.lastErrorJson = lastError as Prisma.InputJsonValue;
    }

    return this.prisma.matchAfRawBundle.update({
      where: { matchId },
      data,
    });
  }

  buildCoverage(bundle: {
    availabilityJson: unknown;
    fetchedAtJson: unknown;
    lastErrorJson: unknown;
    [key: string]: unknown;
  }) {
    const availability =
      (bundle.availabilityJson as Record<string, AfAvailabilityStatus>) ?? {};
    const fetchedAt = (bundle.fetchedAtJson as Record<string, string>) ?? {};
    const lastError = (bundle.lastErrorJson as Record<string, string | null>) ?? {};
    const rows: Record<string, unknown> = {};
    for (const field of BUNDLE_TRACKED_FIELDS) {
      const key = field.replace(/Json$/, '');
      const val = bundle[field];
      rows[key] = {
        status: availability[key] ?? availabilityFromValue(val, lastError[key]),
        fetchedAt: fetchedAt[key] ?? null,
        lastError: lastError[key] ?? null,
        hasData:
          val != null &&
          (Array.isArray(val) ? val.length > 0 : Object.keys(val as object).length > 0),
      };
    }
    return rows;
  }
}
