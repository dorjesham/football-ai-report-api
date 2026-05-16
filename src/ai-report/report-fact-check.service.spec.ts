import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFactCheckService } from './report-fact-check.service';

describe('ReportFactCheckService', () => {
  let svc: ReportFactCheckService;
  const prisma = {
    match: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ReportFactCheckService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    svc = mod.get(ReportFactCheckService);
    jest.clearAllMocks();
  });

  it('fails when narrative score mismatches DB', async () => {
    prisma.match.findUnique.mockResolvedValue({
      id: 'm1',
      homeScore: 2,
      awayScore: 1,
      matchFacts: {
        events: { schema: 'match-events-v1', items: [] },
        teamStats: null,
        htHome: null,
        htAway: null,
        ftHome: 2,
        ftAway: 1,
      },
    });
    const result = await svc.checkReport({
      id: 'r1',
      matchId: 'm1',
      predictionId: null,
      freeSummary: '终场 3-0 大胜',
      structuredContentJson: {
        schema: 'post-match-analysis-v1',
        recap: [{ text: 'x', pointers: [{ kind: 'score', field: 'match' }] }],
        turningPoints: [],
        motm: { playerName: 'X', teamSide: 'home', rationale: [] },
        keyPlayers: [],
      },
    } as never);
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.code === 'SCORE_MISMATCH')).toBe(true);
  });
});
