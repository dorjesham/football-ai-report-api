import { TacticalSandboxV2Schema } from './tactics-sandbox-v2.schema';

describe('TacticalSandboxV2Schema', () => {
  it('parses minimal valid sandbox', () => {
    const out = TacticalSandboxV2Schema.parse({
      keyMatchups: [{ label: 'LW vs RB', analysis: '速度优势' }],
      attackPatterns: [
        { title: '左路 overload', steps: ['拉宽', '转移'] },
        { title: '中路渗透', steps: ['回撤', '直塞'] },
        { title: '定位球', steps: ['角球'] },
      ],
      defensivePlan: '压缩中路',
      risksAndAdjustments: ['高位丢球'],
      conclusion: '核心在肋部',
      scenarios: [
        {
          scenarioType: 'A',
          title: '主队控场',
          probability: 50,
          precondition: '高位',
          process: '推进',
          timeline: '全场',
        },
        {
          scenarioType: 'B',
          title: '僵持',
          probability: 30,
          precondition: '低位',
          process: '反击',
          timeline: '下半场',
        },
      ],
    });
    expect(out.scenarios).toHaveLength(2);
    expect(out.conclusion).toContain('肋部');
  });
});
