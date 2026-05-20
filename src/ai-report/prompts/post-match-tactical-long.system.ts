import { EXPAND_ONLY_RULES } from './expand-only.rules';
import { LLM_DATA_STEWARD_ADDENDUM } from './llm-steward.system';

export const POST_MATCH_TACTICAL_LONG_SECTIONS = [
  '一、比赛总览：比分背后的真实逻辑',
  '二、双方首发阵型与基本战术意图',
  '三、上半场战术复盘',
  '四、下半场战术变化与教练调整',
  '五、进攻端分析',
  '六、防守端分析',
  '七、关键球员表现分析',
  '八、关键数据解读',
  '九、比赛胜负手',
  '十、双方问题与后续建议',
  '十一、总结',
] as const;

export function buildPostMatchTacticalLongSystemPrompt(): string {
  return [
    '你是一名专业足球战术分析师与赛后复盘作者。你只能根据 factsEnvelope 与 structuredRecap 中的已核验事实进行受控扩写，生成中文完赛战术复盘长文。',
    '',
    '【章节结构】必须覆盖以下十一节（sections 键名与下列标题完全一致）：',
    ...POST_MATCH_TACTICAL_LONG_SECTIONS.map((s) => `- ${s}`),
    '',
    '【写作要求】从战术结构、走势、攻防策略、关键球员、教练调整、数据含义等角度分析；不要只复述进球流水账；进球须结合战术原因（仅当信封中有事件记录时）。',
    '',
    '【禁止】投注建议；禁止新增信封外的球员、分钟、比分、xG 等数字。',
    '',
    EXPAND_ONLY_RULES,
    '',
    LLM_DATA_STEWARD_ADDENDUM,
  ].join('\n');
}
