import { ConfigService } from '@nestjs/config';
import { DataSourceType } from '@prisma/client';
import { WorldCupCoverageService } from './world-cup-coverage.service';
import { PrismaService } from '../prisma/prisma.service';

describe('WorldCupCoverageService', () => {
  const prisma = {
    match: { findUnique: jest.fn() },
  } as unknown as PrismaService;

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'enableAfFactsDualWrite') return false;
      return undefined;
    }),
  } as unknown as ConfigService;

  let svc: WorldCupCoverageService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new WorldCupCoverageService(prisma, config);
  });

  const baseMatch = () => ({
    id: 'm1',
    externalId: 'af-f-1',
    kickoffTime: new Date('2026-06-15T12:00:00Z'),
    city: 'Los Angeles',
    intelContentHash: null,
    competition: { code: 'WC' },
    tournament: { code: 'FIFA_WC' },
    afRawBundle: {
      fixtureJson: { id: 1 },
      predictionsJson: {
        predictions: { percent: { home: '40%', draw: '30%', away: '30%' } },
        comparison: { form: { home: '50%', away: '50%' } },
      },
      injuriesJson: null,
      syncedAt: new Date(),
    },
    teamSnapshots: [],
    weatherSnapshot: null,
    activePrediction: null,
    refereeSnapshot: null,
    matchFacts: null,
    homeTeam: { externalId: 'af-t-1' },
    awayTeam: { externalId: 'af-t-2' },
    aiReports: [],
  });

  it('marks red when AF predictions and snapshots are missing', async () => {
    (prisma.match.findUnique as jest.Mock).mockResolvedValue({
      ...baseMatch(),
      afRawBundle: {
        ...baseMatch().afRawBundle,
        predictionsJson: null,
      },
    });
    const cov = await svc.getMatchCoverage('m1');
    expect(cov.status).toBe('red');
    expect(cov.gates.aiPublishable).toBe(false);
    expect(cov.gates.reasons).toEqual(
      expect.arrayContaining([
        'missing_af_predictions',
        'missing_match_prediction',
        'missing_team_snapshots',
        'missing_injuries',
        'missing_intel_content_hash',
        'missing_af_comparison',
      ]),
    );
  });

  it('evaluateGenerateGate is looser than publish gate', async () => {
    (prisma.match.findUnique as jest.Mock).mockResolvedValue({
      ...baseMatch(),
      afRawBundle: {
        ...baseMatch().afRawBundle,
        predictionsJson: { predictions: {}, comparison: { form: { home: '1', away: '1' } } },
      },
      activePrediction: {
        dataSource: DataSourceType.API_FOOTBALL,
        modelVersion: 'af-v1',
        factorBreakdown: {},
        inputsHash: 'h',
      },
      teamSnapshots: [
        { isHome: true, attackRating: null, defenseRating: null },
        { isHome: false, attackRating: 50, defenseRating: 50 },
      ],
    });
    const gen = await svc.evaluateGenerateGate('m1');
    const pub = await svc.evaluatePublishGate('m1');
    expect(gen.aiGeneratable).toBe(true);
    expect(pub.aiPublishable).toBe(false);
  });

  it('requires weather in T-24 window when city present', async () => {
    const kickoff = new Date(Date.now() + 12 * 3600_000);
    (prisma.match.findUnique as jest.Mock).mockResolvedValue({
      ...baseMatch(),
      kickoffTime: kickoff,
      intelContentHash: 'abc',
      afRawBundle: {
        fixtureJson: {},
        predictionsJson: {
          predictions: { percent: { home: '40%', draw: '30%', away: '30%' } },
          comparison: { form: { home: '50%', away: '50%' } },
        },
        injuriesJson: [],
      },
      teamSnapshots: [
        { isHome: true, attackRating: 55, defenseRating: 50 },
        { isHome: false, attackRating: 50, defenseRating: 55 },
      ],
      activePrediction: {
        dataSource: DataSourceType.API_FOOTBALL,
        modelVersion: 'af-v1',
        factorBreakdown: {},
        inputsHash: 'h',
      },
    });
    const pub = await svc.evaluatePublishGate('m1');
    expect(pub.reasons).toContain('missing_weather');
  });
});
