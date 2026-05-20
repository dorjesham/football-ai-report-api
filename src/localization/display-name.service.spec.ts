import { DisplayNameService } from './display-name.service';
import { LocalizationSeedLoader } from './localization-seed.loader';
import { LocalizationService } from './localization.service';

describe('DisplayNameService', () => {
  const seeds = {
    getTeamSeed: jest.fn(),
    getCompetitionSeed: jest.fn(),
    getPlayerSeed: jest.fn(),
  } as unknown as LocalizationSeedLoader;

  const l10n = {
    getApprovedByEntityIds: jest.fn().mockResolvedValue(new Map()),
    loadTeamsForDisplay: jest.fn(),
    loadCompetitionsForDisplay: jest.fn(),
    loadPlayersForDisplay: jest.fn(),
  } as unknown as LocalizationService;

  const dns = new DisplayNameService(seeds, l10n);

  it('prefers seed over English nameCn', () => {
    (seeds.getTeamSeed as jest.Mock).mockReturnValue({
      nameCn: '曼联',
      shortNameCn: '曼联',
    });
    const r = dns.resolveTeam({
      nameCn: 'Manchester United',
      nameEn: 'Manchester United',
      externalId: 'af-t-33',
    });
    expect(r.displayName).toBe('曼联');
    expect(r.translationStatus).toBe('approved');
  });

  it('falls back to nameEn when no translation', () => {
    (seeds.getTeamSeed as jest.Mock).mockReturnValue(null);
    const r = dns.resolveTeam({
      nameCn: 'Unknown FC',
      nameEn: 'Unknown FC',
      externalId: 'af-t-99999',
    });
    expect(r.displayName).toBe('Unknown FC');
    expect(r.translationStatus).toBe('fallback');
  });
});
