import {
  parseCsvLine,
  parseFbrefPlayerStatsTable,
  stripBom,
} from './fbref-csv-parse';

describe('fbref-csv-parse', () => {
  it('parseCsvLine handles quotes and doubled quotes', () => {
    expect(parseCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    expect(parseCsvLine('"x""y",z')).toEqual(['x"y', 'z']);
  });

  it('parseFbrefPlayerStatsTable finds header after preamble', () => {
    const csv = `Some note
Rk,Player,Nation,Pos,Age,Squad,MP,Min,xG
1,Ada Lovelace,ENG,F,29,Manchester City,10,900,0.5
`;
    const t = parseFbrefPlayerStatsTable(stripBom(csv));
    expect(t.headers).toContain('Player');
    expect(t.headers).toContain('Squad');
    expect(t.dataRows).toHaveLength(1);
    expect(t.dataRows[0][1]).toContain('Ada Lovelace');
  });
});
