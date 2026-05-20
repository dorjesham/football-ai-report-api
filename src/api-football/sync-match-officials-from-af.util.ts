import { DataQuality, DataSourceType, Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { asRecord } from './af-fixture-match-fields.util';

export type AfVenueDetail = {
  id?: unknown;
  name?: string | null;
  city?: string | null;
  address?: string | null;
  capacity?: unknown;
  surface?: string | null;
  image?: string | null;
};

/** 从 AF GET /fixtures?id= 单项写入场地、裁判组、RefereeSnapshot */
export async function syncMatchOfficialsFromAfFixture(
  prisma: PrismaService,
  matchId: string,
  fixtureId: number,
  rawItem: unknown,
): Promise<{
  refereeSynced: boolean;
  venueSynced: boolean;
  referee?: { id: string; nameEn: string };
}> {
  const itemRec = asRecord(rawItem);
  const fx = asRecord(itemRec?.fixture);
  const venue = asRecord(fx?.venue);
  const refereeStr =
    typeof fx?.referee === 'string' && fx.referee.trim() ? fx.referee.trim() : null;

  const venueDetail: AfVenueDetail = {
    id: venue?.id,
    name: typeof venue?.name === 'string' ? venue.name : null,
    city: typeof venue?.city === 'string' ? venue.city : null,
    address: typeof venue?.address === 'string' ? venue.address : null,
    capacity: venue?.capacity,
    surface: typeof venue?.surface === 'string' ? venue.surface : null,
    image: typeof venue?.image === 'string' ? venue.image : null,
  };

  const officials = refereeStr
    ? [{ role: 'Referee', name: refereeStr, source: 'API_FOOTBALL' }]
    : [];

  const stadiumFromVenue =
    typeof venue?.name === 'string' && venue.name.trim() ? venue.name.trim() : null;

  if (stadiumFromVenue) {
    await prisma.match.update({
      where: { id: matchId },
      data: { stadium: stadiumFromVenue },
    });
  }

  const existingFacts = await prisma.matchFacts.findUnique({ where: { matchId } });
  await prisma.matchFacts.upsert({
    where: { matchId },
    create: {
      matchId,
      officials: officials as unknown as Prisma.InputJsonValue,
      venueDetail: venueDetail as Prisma.InputJsonValue,
      primaryProvider: DataSourceType.API_FOOTBALL,
    },
    update: {
      officials:
        officials.length > 0
          ? (officials as unknown as Prisma.InputJsonValue)
          : existingFacts?.officials ?? undefined,
      venueDetail: venueDetail as Prisma.InputJsonValue,
    },
  });

  let refereeSynced = false;
  if (refereeStr) {
    const ref = await prisma.referee.upsert({
      where: { externalId: `af-ref-${fixtureId}` },
      create: {
        externalId: `af-ref-${fixtureId}`,
        nameCn: refereeStr,
        nameEn: refereeStr,
        dataSource: DataSourceType.API_FOOTBALL,
      },
      update: { nameCn: refereeStr, nameEn: refereeStr },
    });
    await prisma.refereeSnapshot.upsert({
      where: { matchId },
      create: {
        matchId,
        refereeId: ref.id,
        notes: `主裁判来自 API-Football fixture ${fixtureId}`,
        dataQuality: DataQuality.PUBLIC_DATA,
        dataSource: DataSourceType.API_FOOTBALL,
      },
      update: {
        refereeId: ref.id,
        notes: `主裁判来自 API-Football fixture ${fixtureId}`,
        dataSource: DataSourceType.API_FOOTBALL,
      },
    });
    refereeSynced = true;
    return {
      refereeSynced,
      venueSynced: !!stadiumFromVenue,
      referee: { id: ref.id, nameEn: refereeStr },
    };
  }

  return { refereeSynced, venueSynced: !!stadiumFromVenue };
}
