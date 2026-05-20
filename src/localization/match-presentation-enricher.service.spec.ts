import { MatchPresentationEnricherService } from './match-presentation-enricher.service';
import { DisplayNameService } from './display-name.service';
import { FootballDictionaryService } from './football-dictionary.service';

describe('MatchPresentationEnricherService', () => {
  const dict = {
    matchStatusCn: jest.fn().mockReturnValue('进行中'),
    eventTypeCn: jest.fn().mockReturnValue('进球'),
    statTypeCn: jest.fn(),
    oddsMarketCn: jest.fn().mockReturnValue('胜平负'),
  } as unknown as FootballDictionaryService;

  const displayName = {
    teamsByIds: jest.fn(),
    resolveTeam: jest.fn(),
    resolveCompetition: jest.fn(),
  } as unknown as DisplayNameService;

  const enricher = new MatchPresentationEnricherService(displayName, dict);

  it('enriches live events with typeCn', () => {
    const ev = enricher.enrichEvent({ type: 'Goal', detail: 'Normal Goal' });
    expect(ev.typeCn).toBe('进球');
  });
});
