import { resolveFdPersonAvatarUrl, resolveFdPersonNameCn } from './football-data-person-display';

describe('football-data-person-display', () => {
  it('resolveFdPersonNameCn uses map then falls back', () => {
    expect(resolveFdPersonNameCn('99813', 'Bukayo Saka')).toBe('布卡约·萨卡');
    expect(resolveFdPersonNameCn('999999999', 'X Y')).toBe('X Y');
  });

  it('resolveFdPersonAvatarUrl', () => {
    expect(resolveFdPersonAvatarUrl('1')).toBeNull();
  });
});
