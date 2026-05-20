import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataQuality, DataSourceType } from '@prisma/client';
import axios from 'axios';
import { z } from 'zod';
import { DeepseekService } from '../deepseek/deepseek.service';
import { LLM_DATA_STEWARD_ADDENDUM } from '../match-llm-dossier/llm-dossier-policy';
import { MatchLlmDossierService } from '../match-llm-dossier/match-llm-dossier.service';
import { shouldUseDeepseekMock } from '../common/utils/deepseek-env.util';
import { PrismaService } from '../prisma/prisma.service';

const FantasyAiSchema = z.object({
  mustHave: z.array(z.string()).min(1).max(8),
  valuePicks: z.array(z.string()).min(1).max(8),
  avoid: z.array(z.string()).min(1).max(8),
  captainRecommendation: z.string().min(6).max(800),
  riskWarnings: z.array(z.string()).min(1).max(8),
  predictedPoints: z.record(z.string(), z.number()).optional(),
});

@Injectable()
export class FantasyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly deepseek: DeepseekService,
    private readonly dossier: MatchLlmDossierService,
  ) {}

  async generate(matchId: string) {
    await this.ensureMatch(matchId);
    const dossier = await this.dossier.buildDossier(matchId);
    const dossierBlock = this.dossier.formatCompactForPrompt(dossier);

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: true,
        awayTeam: true,
        playerSnapshots: { include: { player: true }, take: 32 },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const existing = await this.prisma.fantasyAdvice.findUnique({
      where: { matchId },
      select: { lineupLaboratory: true },
    });

    const staticPayload = () => ({
      mustHave: ['核心球员首发概率高者优先关注'],
      valuePicks: ['中场性价比球员（演示）'],
      avoid: ['伤病观察名单（演示）'],
      captainRecommendation: '请选择你认为最可能打满且参与进球的球员（演示）。',
      predictedPoints: {} as Record<string, number>,
      riskWarnings: ['Fantasy 建议不等于投注建议'],
      priceSource: '演示/手动维护',
      dataQuality: DataQuality.AI_GENERATED,
      dataSource: DataSourceType.MODEL,
      rawInput: {
        dossier,
        mode: 'static_fallback',
      } as object,
    });

    if (shouldUseDeepseekMock(this.config)) {
      const s = staticPayload();
      const { rawInput, ...rest } = s;
      return this.prisma.fantasyAdvice.upsert({
        where: { matchId },
        create: {
          matchId,
          ...rest,
          rawInput: rawInput as object,
          lineupLaboratory: existing?.lineupLaboratory ?? undefined,
        },
        update: {
          ...rest,
          rawInput: rawInput as object,
          rawOutput: undefined,
        },
      });
    }

    try {
      const system = [
        '你是足球赛前 Fantasy / 范特西向建议助手。只输出合法 JSON，字段见用户说明。',
        '必须遵守 dataAvailability：missing 的维度不得编造具体球员赛季数据、伤停名单或价格；只能给原则性建议并说明数据不足。',
        '不得提供投注建议；不得承诺球员一定首发或一定得分。',
        '中文输出。',
        '',
        LLM_DATA_STEWARD_ADDENDUM,
      ].join('\n');

      const playerBrief = match.playerSnapshots.map((s) => ({
        playerId: s.playerId,
        teamId: s.teamId,
        nameCn: s.player?.nameCn ?? null,
        nameEn: s.player?.nameEn ?? null,
        expectedStartProbability: s.expectedStartProbability,
        riskLevel: s.riskLevel,
        fitnessScore: s.fitnessScore,
      }));

      const user = `${dossierBlock}\n\n【对阵】${match.homeTeam.nameCn} vs ${match.awayTeam.nameCn}\n请基于以上分层材料与下列球员快照，输出 JSON：\n- mustHave: string[] 必关注（1～8 条短句，勿编造未在输入出现的伤停事实）\n- valuePicks: string[] 性价比（1～8）\n- avoid: string[] 谨慎/避开（1～8）\n- captainRecommendation: string 队长思路一段话\n- riskWarnings: string[] 风险（1～8）\n- predictedPoints?: Record<球员名或占位键, number> 可选，若无可靠依据可省略或为空对象\n\n球员快照：\n${JSON.stringify(playerBrief).slice(0, 8000)}`;

      const out = await this.deepseek.completeChatJson(system, user, FantasyAiSchema);

      const rawInput = { dossier, playerBrief, homeTeam: match.homeTeam.nameCn, awayTeam: match.awayTeam.nameCn };
      const rawOutput = out;

      return this.prisma.fantasyAdvice.upsert({
        where: { matchId },
        create: {
          matchId,
          mustHave: out.mustHave,
          valuePicks: out.valuePicks,
          avoid: out.avoid,
          captainRecommendation: out.captainRecommendation,
          predictedPoints: (out.predictedPoints ?? {}) as object,
          riskWarnings: out.riskWarnings,
          priceSource: 'DEEPSEEK+LLM_DOSSIER',
          dataQuality: DataQuality.AI_GENERATED,
          dataSource: DataSourceType.DEEPSEEK,
          rawInput: rawInput as object,
          rawOutput: rawOutput as object,
          lineupLaboratory: existing?.lineupLaboratory ?? undefined,
        },
        update: {
          mustHave: out.mustHave,
          valuePicks: out.valuePicks,
          avoid: out.avoid,
          captainRecommendation: out.captainRecommendation,
          predictedPoints: (out.predictedPoints ?? {}) as object,
          riskWarnings: out.riskWarnings,
          priceSource: 'DEEPSEEK+LLM_DOSSIER',
          dataQuality: DataQuality.AI_GENERATED,
          dataSource: DataSourceType.DEEPSEEK,
          rawInput: rawInput as object,
          rawOutput: rawOutput as object,
          lineupLaboratory: existing?.lineupLaboratory ?? undefined,
        },
      });
    } catch {
      const s = staticPayload();
      const { rawInput, ...rest } = s;
      return this.prisma.fantasyAdvice.upsert({
        where: { matchId },
        create: {
          matchId,
          ...rest,
          rawInput: { ...(rawInput as object), deepseekError: true },
          lineupLaboratory: existing?.lineupLaboratory ?? undefined,
        },
        update: {
          ...rest,
          rawInput: { ...(rawInput as object), deepseekError: true },
          rawOutput: undefined,
        },
      });
    }
  }

  get(matchId: string) {
    return this.prisma.fantasyAdvice.findUnique({ where: { matchId } });
  }

  /**
   * 拉取英超 FPL 官方 `bootstrap-static`（无需 Key），写 ApiLog；
   * 并对 `externalId` 形如 `af-p-*` 且队名与 FPL `teams.short_name` 能弱匹配的球员尝试写入 `fantasyPrice`（启发式）。
   */
  async syncFplBootstrap() {
    const { data, status } = await axios.get<{
      elements?: Array<{
        web_name?: string;
        team?: number;
        now_cost?: number;
      }>;
      teams?: Array<{ id?: number; short_name?: string; name?: string }>;
    }>('https://fantasy.premierleague.com/api/bootstrap-static/', {
      timeout: 30_000,
      headers: { Accept: 'application/json' },
    });
    const els = Array.isArray(data?.elements) ? data.elements.length : 0;
    const teamRows = Array.isArray(data?.teams) ? data.teams : [];
    await this.prisma.apiLog.create({
      data: {
        provider: 'fpl',
        endpoint: 'bootstrap-static',
        method: 'GET',
        statusCode: status,
        success: true,
        message: `elements=${els} teams=${teamRows.length}`,
      },
    });
    const shortById = new Map<number, string>();
    for (const t of teamRows) {
      const id = Number(t?.id);
      const sn = typeof t?.short_name === 'string' ? t.short_name.trim() : '';
      if (Number.isFinite(id) && sn) shortById.set(id, sn);
    }
    let fantasyPriceWrites = 0;
    if (Array.isArray(data?.elements)) {
      for (const el of data.elements) {
        const tid = Number(el.team);
        const web = typeof el.web_name === 'string' ? el.web_name.trim() : '';
        const price = typeof el.now_cost === 'number' ? el.now_cost / 10 : null;
        const tShort = shortById.get(tid);
        if (!Number.isFinite(tid) || !web || price == null || !tShort) continue;
        const candidates = await this.prisma.player.findMany({
          where: {
            externalId: { startsWith: 'af-p-' },
            nameEn: { contains: web },
            team: {
              OR: [{ shortName: { contains: tShort } }, { nameEn: { contains: tShort } }],
            },
          },
          take: 1,
        });
        const p = candidates[0];
        if (!p) continue;
        await this.prisma.player.update({
          where: { id: p.id },
          data: { fantasyPrice: price, fantasySource: 'FPL' },
        });
        fantasyPriceWrites += 1;
      }
    }
    return {
      ok: true,
      elements: els,
      teams: teamRows.length,
      fantasyPriceWrites,
      message:
        'FPL bootstrap-static 已拉取；对部分 af-p-* 球员按 web_name + 球队缩写做了 fantasyPrice 启发式写入（英超 API-Football 阵容越全命中越多）。',
    };
  }

  private async ensureMatch(matchId: string) {
    const m = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!m) throw new NotFoundException('Match not found');
  }
}
