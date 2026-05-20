import { buildPreMatchIntelEnvelope } from './pre-match-intel-envelope.builder';
import type { MatchLlmDossier } from '../../match-llm-dossier/match-llm-dossier.types';

const dossierStub: MatchLlmDossier = {
  matchId: 'm1',
  builtAt: new Date().toISOString(),
  dataAvailability: { prediction: 'present' },
  preparationWarnings: [],
  layers: {
    footballData: {
      externalId: 'af-f-1',
      status: 'SCHEDULED',
      kickoffTime: '2026-05-20T15:00:00.000Z',
      stadium: '球场',
      homeScore: null,
      awayScore: null,
      competitionCode: 'PL',
      competitionNameCn: '英超',
      round: null,
    },
    teams: {
      home: { id: 'h1', nameCn: '主队', nameEn: 'Home' },
      away: { id: 'a1', nameCn: '客队', nameEn: 'Away' },
    },
    afTeamComparison: {
      available: true,
      percent: { home: 52, draw: 24, away: 24 },
      comparison: { form: { home: '80%', away: '60%' } },
      advice: null,
    },
    teamSnapshots: { home: { recentForm: 'WWDLW' }, away: null },
    prediction: {
      homeWinProbability: 45,
      drawProbability: 28,
      awayWinProbability: 27,
    },
    weather: null,
    referee: null,
    headToHead: null,
    playerSnapshotsCount: 22,
    playerIntelligenceCount: 0,
    publicSourceDigests: [],
  },
};

describe('buildPreMatchIntelEnvelope', () => {
  it('marks model probability section present when prediction exists', () => {
    const env = buildPreMatchIntelEnvelope('m1', dossierStub);
    expect(env.schema).toBe('pre-match-intel-envelope-v1');
    expect(env.sectionAvailability['十、模型概率解读（非投注）']).toBe('present');
    expect(env.facts.modelProbabilities?.home).toBe(45);
  });

  it('marks injuries missing when not provided', () => {
    const env = buildPreMatchIntelEnvelope('m1', dossierStub);
    expect(env.sectionAvailability['三、阵容与伤停影响']).toBe('missing');
  });
});
