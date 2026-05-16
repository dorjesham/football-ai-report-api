import { pickFirstHttpImageUrlFromUnknown } from './fd-image-url.util';

describe('pickFirstHttpImageUrlFromUnknown', () => {
  it('reads common image keys', () => {
    expect(
      pickFirstHttpImageUrlFromUnknown({
        photo: 'https://cdn.example.com/a.png',
        name: 'x',
      }),
    ).toBe('https://cdn.example.com/a.png');
  });

  it('returns null when no url', () => {
    expect(pickFirstHttpImageUrlFromUnknown({ id: 1, name: 'A' })).toBeNull();
  });
});
