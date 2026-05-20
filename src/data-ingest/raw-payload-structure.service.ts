import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepseekService } from '../deepseek/deepseek.service';
import { shouldUseDeepseekMock } from '../common/utils/deepseek-env.util';
import {
  MatchFactsPartialEnvelopeSchema,
  type MatchFactsPartialEnvelope,
} from './schemas/match-facts-envelope.zod';

/**
 * 爬虫/剪贴板原始文本 → DeepSeek 结构化 → Zod 校验；失败可重试，仍失败则丢弃。
 */
@Injectable()
export class RawPayloadStructureService {
  constructor(
    private readonly deepseek: DeepseekService,
    private readonly config: ConfigService,
  ) {}

  async structureMatchFactsEnvelope(
    rawText: string,
    opts?: { maxAttempts?: number; hint?: string },
  ): Promise<MatchFactsPartialEnvelope> {
    if (!rawText?.trim()) {
      throw new BadRequestException('rawText is empty');
    }
    if (shouldUseDeepseekMock(this.config)) {
      throw new BadRequestException(
        'DeepSeek mock 模式不支持结构化入库；请配置 DEEPSEEK_API_KEY 并关闭 ENABLE_MOCK_DEEPSEEK',
      );
    }

    const maxAttempts = Math.min(5, Math.max(1, opts?.maxAttempts ?? 2));
    const hint = opts?.hint?.trim() || '';

    const system = `You normalize messy football match data into strict JSON.
Rules:
- Output ONLY one JSON object matching the schema implied by user message.
- Use null or omit unknown fields. Never invent player ids.
- teamStats.home / away may include possessionPct, shots, shotsOnTarget, corners, fouls, xg, passes, passAccuracyPct.
- Numbers must be JSON numbers, not strings.`;

    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const user = `${hint ? `Context: ${hint}\n\n` : ''}Raw input:\n---\n${rawText}\n---\n\nReturn JSON with optional keys: teamStats, lineups, events, officials, venueDetail, weatherDetail, externalRefs.`;
      try {
        const out = await this.deepseek.completeChatJson(
          system,
          user,
          MatchFactsPartialEnvelopeSchema,
        );
        return out;
      } catch (e) {
        lastErr = e;
        if (attempt === maxAttempts) break;
      }
    }
    throw new BadRequestException(
      `validation failed after ${maxAttempts} attempts: ${String(lastErr)}`,
    );
  }
}
