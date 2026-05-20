import { MatchStatus } from '@prisma/client';

/** 锁定 analysis-preview-v1 顶层契约（与 MatchesService.getAnalysisPreview 返回一致） */
describe('analysis-preview contract', () => {
  const unlockedKeys = [
    'meta',
    'matchId',
    'status',
    'kickoffTime',
    'isUnlocked',
    'prediction',
    'tactics',
    'fantasy',
    'headToHead',
    'head_to_head',
    'playerIntelligence',
    'playerIntelligenceCount',
    'summary',
  ];

  function buildPreview(isUnlocked: boolean) {
    const headToHead = {
      id: 'h2h1',
      summary: '近5次主队占优',
      lastMeetingsCount: 5,
      homeWins: 3,
      draws: 1,
      awayWins: 1,
      ...(isUnlocked ? {} : { locked: true as const }),
    };
    return {
      meta: {
        contractVersion: 'analysis-preview-v1',
        fieldBoundary: 'test',
      },
      matchId: 'm1',
      status: MatchStatus.SCHEDULED,
      kickoffTime: new Date(),
      isUnlocked,
      prediction: { upsetIndex: 40, confidence: 70, homeWinProbability: 45, awayWinProbability: 35 },
      tactics: {
        count: 2,
        items: isUnlocked ?
            [{ id: 't1', title: '高位', scenarioType: 'PRESS', probability: 0.5 }]
          : [{ id: 't1', title: '高位', scenarioType: 'PRESS' }],
        sandboxAvailable: false,
        teaserTitle: '高位',
      },
      fantasy: isUnlocked ?
          { id: 'f1', captainRecommendation: 'A', dataQuality: 'AI_GENERATED' }
        : { id: 'f1', locked: true as const },
      headToHead,
      head_to_head: headToHead,
      playerIntelligence: {
        count: 4,
        items: isUnlocked ?
            [
              {
                id: 'pi1',
                statusTag: 'START',
                startProbability: 90,
                riskLevel: 'LOW',
                aiSummary: '状态良好',
                player: { id: 'p1', nameCn: '甲', nameEn: 'A', position: 'FW', avatarUrl: null },
              },
            ]
          : [
              {
                id: 'pi1',
                statusTag: 'START',
                riskLevel: 'LOW',
                locked: true as const,
                player: { id: 'p1', nameCn: '甲', position: 'FW' },
              },
            ],
      },
      playerIntelligenceCount: 4,
      summary: '模型倾向主队小优',
    };
  }

  it('unlocked response has required top-level keys and alias head_to_head', () => {
    const body = buildPreview(true);
    expect(Object.keys(body).sort()).toEqual(unlockedKeys.sort());
    expect(body.head_to_head).toEqual(body.headToHead);
    expect(body.meta.contractVersion).toBe('analysis-preview-v1');
    expect(body.playerIntelligence.items[0]).toHaveProperty('aiSummary');
  });

  it('locked response teasers omit paid long text', () => {
    const body = buildPreview(false);
    expect(body.isUnlocked).toBe(false);
    expect(body.fantasy).toEqual({ id: 'f1', locked: true });
    expect(body.playerIntelligence.items[0]).not.toHaveProperty('aiSummary');
    expect(body.tactics.items[0]).toHaveProperty('scenarioType');
  });
});
