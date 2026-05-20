import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { z } from 'zod';
import { shouldUseDeepseekMock } from '../common/utils/deepseek-env.util';
import { safeJsonParse } from '../common/utils/safe-json-parse';
import { DeepseekConcurrencyService } from './deepseek-concurrency.service';

/** 模型偶发省略字段或非 string；先归一化再校验，避免整次生成失败 */
function zodStringField(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

const ReportJsonSchema = z
  .object({
    freeSummary: z.preprocess(zodStringField, z.string()),
    dashboardSummary: z.string().optional(),
    refereeAnalysis: z.any().optional(),
    weatherAnalysis: z.any().optional(),
    playerProfiles: z.any().optional(),
    tacticalScenarios: z.any().optional(),
    fantasyAdvice: z.any().optional(),
    historicalInsight: z.string().optional(),
    headToHeadInsight: z.any().optional(),
    expertVariables: z.any().optional(),
    socialGuide: z.any().optional(),
    sourceSummary: z.any().optional(),
    disclaimer: z.preprocess(zodStringField, z.string()),
  })
  .passthrough();

export type ParsedReport = z.infer<typeof ReportJsonSchema>;

const PolishStructuredReportSchema = z.object({
  sections: z.record(z.string(), z.string()),
  disclaimer: z.string().optional(),
});

const PredictionNarrativeSchema = z.object({
  explanation: z.string(),
  narrativeCn: z.string().optional(),
});

const LongFormOutputSchema = z.object({
  markdown: z.string(),
  sections: z.record(z.string(), z.string()).optional(),
});

export type LongFormMarkdownResult = z.infer<typeof LongFormOutputSchema>;

@Injectable()
export class DeepseekService {
  constructor(
    private readonly config: ConfigService,
    private readonly deepseekConcurrency: DeepseekConcurrencyService,
  ) {}

  /** 非 mock 模式下调用 Chat Completions，返回 message content 字符串（应为 JSON）。 */
  private async rawChatJsonObjectContent(
    systemPrompt: string,
    userPrompt: string,
    opts?: { temperature?: number },
  ): Promise<string> {
    const key = this.config.get<string>('deepseekApiKey');
    if (!key?.trim()) {
      throw new Error('DEEPSEEK_API_KEY missing');
    }
    const base = (this.config.get<string>('deepseekBaseUrl') || 'https://api.deepseek.com').replace(
      /\/$/,
      '',
    );
    const url = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    const model = this.config.get<string>('deepseekModel') || 'deepseek-chat';
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    };
    if (opts?.temperature != null && Number.isFinite(opts.temperature)) {
      body.temperature = opts.temperature;
    }
    return this.deepseekConcurrency.runExclusive(async () => {
      const { data } = await axios.post(
        url,
        body,
        {
          headers: { Authorization: `Bearer ${key}` },
          timeout: 120000,
        },
      );
      return String(data?.choices?.[0]?.message?.content || '{}');
    });
  }

  /**
   * 通用 JSON 输出（Zod 校验）。仅在非 mock 且已配置 Key 时使用；调用方应先判断 {@link shouldUseDeepseekMock}。
   */
  async completeChatJson<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const text = await this.rawChatJsonObjectContent(systemPrompt, userPrompt);
    const parsed = safeJsonParse<unknown>(text, {});
    return schema.parse(parsed);
  }

  /**
   * 极短请求验证 API Key、网络与 JSON 模式；mock 下不发起 HTTP。
   */
  async smokePing(): Promise<{
    ok: boolean;
    latencyMs: number;
    model: string;
    error?: string;
  }> {
    const model = this.config.get<string>('deepseekModel') || 'deepseek-chat';
    if (shouldUseDeepseekMock(this.config)) {
      return { ok: true, latencyMs: 0, model: 'mock' };
    }
    const t0 = Date.now();
    const SmokeSchema = z.object({ pong: z.literal(true) });
    try {
      await this.completeChatJson(
        'You output only one JSON object with exactly one property: "pong" set to true. No markdown, no prose.',
        '{"task":"respond with {\\"pong\\":true}"}',
        SmokeSchema,
      );
      return { ok: true, latencyMs: Date.now() - t0, model };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        model,
        error: msg.slice(0, 500),
      };
    }
  }

  async generateReportJson(systemPrompt: string, userPrompt: string): Promise<ParsedReport> {
    if (shouldUseDeepseekMock(this.config)) {
      const raw = {
        freeSummary: '演示：基于结构化输入生成的免费摘要。模型估算与 AI 推演不构成赛果保证。',
        dashboardSummary: '演示仪表盘摘要',
        refereeAnalysis: { conclusion: '暂无可靠公开数据', impactPoints: [] },
        weatherAnalysis: { conclusion: '暂无可靠公开数据', impactPoints: [] },
        playerProfiles: [],
        tacticalScenarios: [],
        fantasyAdvice: {},
        historicalInsight: '暂无可靠公开数据',
        headToHeadInsight: { summary: '暂无可靠公开数据', keyStats: [], missingFields: [] },
        expertVariables: [],
        socialGuide: {},
        sourceSummary: {
          usedSources: ['演示'],
          missingSources: [],
          dataLimitations: '演示数据',
        },
        disclaimer:
          '本报告基于公开信息、手动录入数据和 AI 模型推演生成，仅供赛前阅读和娱乐参考，不构成投注建议或赛果保证。体育赛事存在不可预测的随机变量。',
      };
      return ReportJsonSchema.parse(raw);
    }

    const t = this.config.get<number>('deepseekReportTemperature');
    const text = await this.rawChatJsonObjectContent(systemPrompt, userPrompt, {
      temperature: Number.isFinite(t) ? t : 0.35,
    });
    const parsed = safeJsonParse<unknown>(text, {});
    return ReportJsonSchema.parse(parsed);
  }

  /** 仅润色赛前预测文案，不得改动概率/进球等数值。 */
  async enrichPredictionNarrative(input: {
    homeTeam: string;
    awayTeam: string;
    explanation: string;
    homeWinProbability: number;
    drawProbability: number;
    awayWinProbability: number;
    advice?: string;
  }): Promise<{ explanation: string; narrativeCn?: string }> {
    const base = input.explanation.trim() || 'API-Football 赛前预测';
    if (shouldUseDeepseekMock(this.config)) {
      return {
        explanation: `${base}（演示润色）`,
        narrativeCn: '演示：基于 API-Football 概率的中文简述，不构成投注建议。',
      };
    }
    const userPrompt = JSON.stringify({
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      probabilities: {
        home: input.homeWinProbability,
        draw: input.drawProbability,
        away: input.awayWinProbability,
      },
      advice: input.advice ?? base,
    });
    const out = await this.completeChatJson(
      '你是足球赛前分析编辑。根据给定 JSON 输出中文 JSON：{"explanation":"80-160字主文案","narrativeCn":"可选200字内补充"}。禁止修改或编造任何百分比、进球期望、赛果；不得推荐投注。',
      userPrompt,
      PredictionNarrativeSchema,
    );
    return {
      explanation: out.explanation.trim() || base,
      narrativeCn: out.narrativeCn?.trim() || undefined,
    };
  }

  /** 受控扩写长文：返回 markdown + 分节 sections（JSON 包装）。 */
  async generateMarkdownLongForm(
    systemPrompt: string,
    userPrompt: string,
    opts?: { mockMarkdown?: string },
  ): Promise<LongFormMarkdownResult> {
    if (shouldUseDeepseekMock(this.config)) {
      const md =
        opts?.mockMarkdown ??
        '演示：基于结构化事实信封生成的长文扩写。不构成投注建议或赛果保证。';
      return LongFormOutputSchema.parse({
        markdown: md,
        sections: { 演示: md },
      });
    }
    const t = this.config.get<number>('llmLongFormTemperature');
    const temp = typeof t === 'number' && Number.isFinite(t) ? t : 0.3;
    const out = await this.completeChatJson(systemPrompt, userPrompt, LongFormOutputSchema);
    const maxChars = this.config.get<number>('llmLongFormMaxChars') ?? 6000;
    return {
      markdown: out.markdown.slice(0, maxChars),
      sections: out.sections,
    };
  }

  /** 仅润色结构化块文本，不得新增数字/球员/赛果。 */
  async polishStructuredReport(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<z.infer<typeof PolishStructuredReportSchema>> {
    if (shouldUseDeepseekMock(this.config)) {
      const parsed = safeJsonParse<{ sections?: Record<string, string> }>(userPrompt, {});
      return PolishStructuredReportSchema.parse({
        sections: parsed.sections ?? { summary: '演示叙事润色。' },
        disclaimer: '本内容基于结构化事实生成，仅供阅读参考。',
      });
    }
    const t = this.config.get<number>('deepseekReportTemperature');
    const temp =
      typeof t === 'number' && Number.isFinite(t) ? Math.min(t, 0.4) : 0.25;
    const text = await this.rawChatJsonObjectContent(systemPrompt, userPrompt, {
      temperature: temp,
    });
    const parsed = safeJsonParse<unknown>(text, {});
    return PolishStructuredReportSchema.parse(parsed);
  }
}
