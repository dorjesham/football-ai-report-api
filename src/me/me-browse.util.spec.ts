import { BrowseHistoryType } from '@prisma/client';
import { parseBrowseHistoryType, browseHistoryTypeToApi } from './me-browse.util';

describe('me-browse.util', () => {
  it('maps api type strings to prisma enum', () => {
    expect(parseBrowseHistoryType('analysis')).toBe(BrowseHistoryType.ANALYSIS);
    expect(parseBrowseHistoryType('POSTER')).toBe(BrowseHistoryType.POSTER);
    expect(browseHistoryTypeToApi(BrowseHistoryType.VIEW)).toBe('view');
  });
});
