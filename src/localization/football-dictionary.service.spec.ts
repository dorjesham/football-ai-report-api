import { FootballDictionaryService } from './football-dictionary.service';

describe('FootballDictionaryService', () => {
  const svc = new FootballDictionaryService();
  svc.onModuleInit();

  it('translates match status NS', () => {
    expect(svc.matchStatusCn('NS')).toBe('未开始');
  });

  it('translates statistics Ball Possession', () => {
    expect(svc.statTypeCn('Ball Possession')).toBe('控球率');
  });
});
