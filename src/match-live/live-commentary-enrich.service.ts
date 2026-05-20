import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { z } from 'zod';
import { DeepseekService } from '../deepseek/deepseek.service';
import { shouldUseDeepseekMock } from '../common/utils/deepseek-env.util';
import type { LiveEventV1 } from './live-event.types';

const CommentaryEnrichSchema = z.object({
  lines: z.array(z.string()).max(5),
});

@Injectable()
export class LiveCommentaryEnrichService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly deepseek: DeepseekService,
  ) {}

  enabled(): boolean {
    return this.config.get<boolean>('enableLiveCommentaryLlm') === true;
  }

  async maybeEnrich(args: {
    matchId: string;
    events: LiveEventV1[];
    homeScore: number | null;
    awayScore: number | null;
  }): Promise<string[] | null> {
    if (!this.enabled() || shouldUseDeepseekMock(this.config)) return null;
    if (args.events.length === 0) return null;

    const recent = args.events.slice(-8);
    const lines = recent.map(
      (e) =>
        `${e.minute ?? '?'}' ${e.teamSide ?? ''} ${e.type} ${e.playerName ?? ''} ${e.detail ?? ''}`.trim(),
    );
    const prompt = `你是足球文字直播编辑。根据以下事件与比分（${args.homeScore ?? 0}-${args.awayScore ?? 0}），用中文写 2-3 条简短直播句式（每条一行，不要编号）：\n${lines.join('\n')}`;

    try {
      const out = await this.deepseek.completeChatJson(
        '只输出 JSON：{ "lines": string[] }，每条为一句中文直播，不要编造未列出的事件。',
        prompt,
        CommentaryEnrichSchema,
      );
      const enriched = out.lines.map((s) => s.trim()).filter(Boolean).slice(0, 5);
      if (enriched.length === 0) return null;

      await this.prisma.matchFacts.upsert({
        where: { matchId: args.matchId },
        create: {
          matchId: args.matchId,
          liveCommentaryEnrichedJson: {
            source: 'LLM',
            lines: enriched,
            at: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
        update: {
          liveCommentaryEnrichedJson: {
            source: 'LLM',
            lines: enriched,
            at: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      return enriched;
    } catch {
      return null;
    }
  }
}
