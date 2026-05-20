import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FootballFeedController } from './football-feed.controller';
import { FootballFeedService } from './football-feed.service';

describe('FootballFeedController', () => {
  const feed = {} as FootballFeedService;

  it('returns 403 in production when feed public disabled', () => {
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'nodeEnv') return 'production';
        if (k === 'enableFootballFeedPublic') return false;
        return undefined;
      }),
    } as unknown as ConfigService;
    const ctrl = new FootballFeedController(feed, config);
    expect(() => ctrl.fixtures({} as never)).toThrow(ForbiddenException);
  });

  it('allows in development', () => {
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'nodeEnv') return 'development';
        if (k === 'enableFootballFeedPublic') return false;
        return undefined;
      }),
    } as unknown as ConfigService;
    const feedMock = { fixturesList: jest.fn().mockResolvedValue({ ok: true }) };
    const ctrl = new FootballFeedController(feedMock as never, config);
    expect(() => ctrl.fixtures({} as never)).not.toThrow();
  });
});
