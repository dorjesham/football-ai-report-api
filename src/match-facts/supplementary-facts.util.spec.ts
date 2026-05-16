import { DataSourceType } from '@prisma/client';
import {
  mergeSupplementarySource,
  shouldUseSupplementaryOnly,
} from './supplementary-facts.util';

describe('supplementary-facts.util', () => {
  it('shouldUseSupplementaryOnly when AF synced', () => {
    expect(
      shouldUseSupplementaryOnly({
        afLastSyncedAt: new Date(),
        primaryProvider: DataSourceType.UNKNOWN,
      }),
    ).toBe(true);
  });

  it('mergeSupplementarySource', () => {
    const out = mergeSupplementarySource(null, 'STATSBOMB', { x: 1 });
    expect(out.sources.STATSBOMB).toEqual({ x: 1 });
    expect(out.schema).toBe('supplementary-facts-v1');
  });
});
