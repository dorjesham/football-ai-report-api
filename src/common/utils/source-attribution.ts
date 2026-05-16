import { DataSourceType } from '@prisma/client';

export function sourceBadge(source: DataSourceType): { type: string; label: string } {
  return { type: source, label: source };
}
