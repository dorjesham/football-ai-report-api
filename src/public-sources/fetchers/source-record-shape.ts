import type { DataQuality, DataSourceType } from '@prisma/client';

export type SourceRecordCreateShape = {
  matchId: string;
  entityType: string;
  entityId: string;
  sourceType: DataSourceType;
  sourceName: string;
  sourceUrl?: string | null;
  title: string;
  content: string;
  dataQuality: DataQuality;
};
