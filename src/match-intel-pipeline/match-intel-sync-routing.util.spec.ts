import {
  shouldRunAfMatchFactsSync,
  shouldRunFootballDataIntelSync,
} from './match-intel-sync-routing.util';
import { DataSourceType } from '@prisma/client';

describe('match-intel-sync-routing', () => {
  it('shouldRunAfMatchFactsSync for af-f-*', () => {
    expect(shouldRunAfMatchFactsSync({ externalId: 'af-f-12345' })).toBe(true);
    expect(shouldRunAfMatchFactsSync({ externalId: 'af-f-abc' })).toBe(false);
    expect(shouldRunAfMatchFactsSync({ externalId: '12345' })).toBe(false);
    expect(shouldRunAfMatchFactsSync({ externalId: null })).toBe(false);
  });

  it('shouldRunFootballDataIntelSync off when enableFootballData=false', () => {
    expect(
      shouldRunFootballDataIntelSync(
        { externalId: '999', dataSource: DataSourceType.FOOTBALL_DATA },
        false,
      ),
    ).toBe(false);
    expect(
      shouldRunFootballDataIntelSync(
        { externalId: 'af-f-1', dataSource: DataSourceType.API_FOOTBALL },
        true,
      ),
    ).toBe(false);
  });

  it('shouldRunFootballDataIntelSync accepts FD when enabled', () => {
    expect(
      shouldRunFootballDataIntelSync(
        { externalId: '999', dataSource: DataSourceType.FOOTBALL_DATA },
        true,
      ),
    ).toBe(true);
  });
});
