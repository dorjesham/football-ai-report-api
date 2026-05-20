import { LocalizationPostIngestHook } from './localization-post-ingest.hook';

describe('LocalizationPostIngestHook', () => {
  it('delegates onTeamUpsert to LocalizationService', async () => {
    const l10n = { onTeamUpsert: jest.fn().mockResolvedValue(undefined) };
    const hook = new LocalizationPostIngestHook(l10n as never);
    await hook.onTeamUpsert({
      id: 't1',
      nameEn: 'A',
      nameCn: 'A',
      externalId: 'af-t-1',
      apiFootballTeamId: 1,
    });
    expect(l10n.onTeamUpsert).toHaveBeenCalled();
  });
});
