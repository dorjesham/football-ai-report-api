import {
  maskEmail,
  normalizeEmail,
  normalizeUsername,
  parseLoginIdentifier,
} from './auth-identity.util';

describe('auth-identity.util', () => {
  it('normalizes email', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });

  it('normalizes username', () => {
    expect(normalizeUsername('fan_2026')).toBe('fan_2026');
  });

  it('masks email', () => {
    expect(maskEmail('user@example.com')).toBe('us***@example.com');
  });

  it('parses login identifier', () => {
    expect(parseLoginIdentifier('a@b.co').kind).toBe('email');
    expect(parseLoginIdentifier('myname').kind).toBe('username');
  });
});
