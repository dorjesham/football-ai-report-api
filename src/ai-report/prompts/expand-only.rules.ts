/** 长文受控扩写共用约束（拼接到各 system prompt 末尾） */
export const EXPAND_ONLY_RULES = `
【受控扩写规则（必须遵守）】
1. 你只能根据 user 消息中的 factsEnvelope 与 sectionAvailability 扩写，禁止新增信封中未出现的球员姓名、球衣号码、具体分钟、比分、统计数据、伤病名单。
2. 对 sectionAvailability 标记为 missing 的章节，只输出一句：「暂无可靠数据，本节从略。」不得编造该节内容。
3. 对 partial 的章节可谨慎概括，并标明「数据不完整」或「AI 推演」。
4. 不得提供投注建议；不得使用「稳胆」「必中」「盘口」等表述。
5. 输出 JSON：{"markdown":"完整中文长文（可用二级标题）","sections":{"一、...":"该节正文",...}}；sections 键名须与任务结构中的章节标题一致。
6. 全文长度控制在合理范围（约 800～1500 字，信息极少时可更短），禁止空洞堆砌。
`.trim();

export const MISSING_SECTION_SENTENCE = '暂无可靠数据，本节从略。';
