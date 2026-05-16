import { matchHomeAwayToPair, roughTeamMatch } from './team-match.util';

describe('team match utils', () => {
  const brief = {
    id: 'm1',
    kickoffTime: new Date(),
    homeTeam: { nameEn: 'Brighton & Hove Albion', nameCn: '布莱顿' },
    awayTeam: { nameEn: 'Aston Villa', nameCn: '阿斯顿维拉' },
  };

  it('roughTeamMatch handles abbreviations', () => {
    expect(roughTeamMatch('Aston Villa', 'Aston Villa FC')).toBe(true);
  });

  it('matchHomeAwayToPair accepts home/away order from API', () => {
    expect(matchHomeAwayToPair('Brighton & Hove Albion', 'Aston Villa', brief)).toBe(true);
  });

  it('matchHomeAwayToPair accepts swapped order', () => {
    expect(matchHomeAwayToPair('Aston Villa', 'Brighton & Hove Albion', brief)).toBe(true);
  });
});
