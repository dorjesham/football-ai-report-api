import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { DeepseekService } from '../deepseek/deepseek.service';
import { shouldUseDeepseekMock } from '../common/utils/deepseek-env.util';
import { PrismaService } from '../prisma/prisma.service';
import type { EntityType, SeedEntry } from './localization.types';
import { parseAfPlayerId, parseAfTeamId, normalizeRefereeKey } from './referee-name.util';
import { LocalizationSeedLoader } from './localization-seed.loader';

const LlmDraftSchema = z.object({
  nameCn: z.string().nullable(),
  shortNameCn: z.string().optional(),
  confidence: z.number().optional(),
});

const EXTERNAL_AF = 'API_FOOTBALL';

@Injectable()
export class LocalizationService {
  private readonly log = new Logger(LocalizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly seeds: LocalizationSeedLoader,
    private readonly deepseek: DeepseekService,
    private readonly config: ConfigService,
  ) {}

  async getApprovedByExternalKey(
    entityType: EntityType,
    externalId: string,
    field = 'name',
  ) {
    return this.prisma.entityTranslation.findFirst({
      where: {
        entityType,
        externalSource: EXTERNAL_AF,
        externalId: String(externalId),
        locale: 'zh-CN',
        field,
        status: 'approved',
      },
    });
  }

  async getApprovedByEntityIds(entityType: EntityType, entityIds: string[]) {
    const map = new Map<string, { translatedText: string; shortText: string | null }>();
    if (!entityIds.length) return map;
    const rows = await this.prisma.entityTranslation.findMany({
      where: {
        entityType,
        entityId: { in: entityIds },
        locale: 'zh-CN',
        field: 'name',
        status: 'approved',
      },
    });
    for (const r of rows) {
      if (r.entityId) map.set(r.entityId, { translatedText: r.translatedText, shortText: r.shortText });
    }
    return map;
  }

  async upsertTranslation(data: {
    entityType: EntityType;
    entityId?: string | null;
    externalId?: string | null;
    sourceText?: string | null;
    translatedText: string;
    shortText?: string | null;
    aliasJson?: Prisma.InputJsonValue;
    source: string;
    status: string;
    locked?: boolean;
    updatedBy?: string;
  }) {
    const externalId = data.externalId ? String(data.externalId) : 'internal';
    return this.prisma.entityTranslation.upsert({
      where: {
        entityType_externalId_locale_field: {
          entityType: data.entityType,
          externalId,
          locale: 'zh-CN',
          field: 'name',
        },
      },
      create: {
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        externalSource: EXTERNAL_AF,
        externalId,
        sourceText: data.sourceText ?? null,
        translatedText: data.translatedText,
        shortText: data.shortText ?? null,
        aliasJson: data.aliasJson,
        source: data.source,
        status: data.status,
        locked: data.locked ?? false,
        updatedBy: data.updatedBy ?? null,
      },
      update: {
        entityId: data.entityId ?? undefined,
        sourceText: data.sourceText ?? undefined,
        translatedText: data.translatedText,
        shortText: data.shortText ?? undefined,
        aliasJson: data.aliasJson,
        source: data.source,
        status: data.status,
        locked: data.locked ?? undefined,
        updatedBy: data.updatedBy ?? undefined,
      },
    });
  }

  async approve(id: string, approvedBy?: string) {
    const row = await this.prisma.entityTranslation.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: approvedBy ?? null,
        approvedAt: new Date(),
      },
    });
    await this.applyApprovedToEntity(row);
    return row;
  }

  async reject(id: string) {
    return this.prisma.entityTranslation.update({
      where: { id },
      data: { status: 'rejected' },
    });
  }

  async applyApprovedToEntity(row: {
    entityType: string;
    entityId: string | null;
    translatedText: string;
    shortText: string | null;
    locked: boolean;
    status: string;
  }): Promise<void> {
    if (row.status !== 'approved' || !row.entityId) return;
    if (row.entityType === 'team') {
      await this.prisma.team.update({
        where: { id: row.entityId },
        data: { nameCn: row.translatedText, shortNameCn: row.shortText ?? undefined },
      });
    } else if (row.entityType === 'player') {
      await this.prisma.player.update({
        where: { id: row.entityId },
        data: { nameCn: row.translatedText, shortNameCn: row.shortText ?? undefined },
      });
    } else if (row.entityType === 'competition') {
      await this.prisma.competition.update({
        where: { id: row.entityId },
        data: { nameCn: row.translatedText, shortNameCn: row.shortText ?? undefined },
      });
    } else if (row.entityType === 'referee') {
      await this.prisma.referee.update({
        where: { id: row.entityId },
        data: { nameCn: row.translatedText },
      });
    }
  }

  async applySeedEntry(
    entityType: EntityType,
    entry: SeedEntry,
    entityId?: string | null,
  ): Promise<void> {
    if (!entry.externalId && !entry.nameEn) return;
    const externalId = entry.externalId ?? entry.nameEn ?? '';
    const existing = await this.prisma.entityTranslation.findFirst({
      where: {
        entityType,
        externalSource: EXTERNAL_AF,
        externalId: String(externalId),
        locale: 'zh-CN',
        field: 'name',
        locked: true,
      },
    });
    if (existing) return;

    const row = await this.upsertTranslation({
      entityType,
      entityId,
      externalId: String(externalId),
      sourceText: entry.nameEn ?? null,
      translatedText: entry.nameCn,
      shortText: entry.shortNameCn ?? null,
      aliasJson: entry.aliases ? { aliases: entry.aliases } : undefined,
      source: 'seed',
      status: 'approved',
    });
    if (entityId) await this.applyApprovedToEntity({ ...row, entityId });
  }

  async onTeamUpsert(team: {
    id: string;
    nameEn: string;
    nameCn: string;
    externalId: string | null;
    apiFootballTeamId: number | null;
  }): Promise<void> {
    const afId = parseAfTeamId(team.externalId, team.apiFootballTeamId);
    const seed = this.seeds.getTeamSeed(afId, team.nameEn);
    if (seed) {
      await this.applySeedEntry('team', seed, team.id);
      return;
    }
    const approved = afId ?
      await this.getApprovedByExternalKey('team', String(afId))
    : null;
    if (approved && !approved.locked) {
      await this.applyApprovedToEntity({ ...approved, entityId: team.id });
    }
  }

  async onPlayerUpsert(player: {
    id: string;
    nameEn: string;
    externalId: string | null;
  }): Promise<void> {
    const afId = parseAfPlayerId(player.externalId);
    const seed = this.seeds.getPlayerSeed(afId);
    if (seed) {
      await this.applySeedEntry('player', seed, player.id);
      return;
    }
    if (afId) {
      const approved = await this.getApprovedByExternalKey('player', String(afId));
      if (approved && !approved.locked && approved.entityId !== player.id) {
        await this.prisma.entityTranslation.update({
          where: { id: approved.id },
          data: { entityId: player.id },
        });
      }
      if (approved && !approved.locked) {
        await this.applyApprovedToEntity({ ...approved, entityId: player.id });
      }
    }
  }

  async onMatchUpsert(match: {
    id: string;
    city: string | null;
    venueName: string | null;
  }): Promise<void> {
    if (match.city) {
      const seed = this.seeds.getCitySeed(match.city);
      if (seed?.nameCn) {
        await this.prisma.match.update({
          where: { id: match.id },
          data: { cityCn: seed.nameCn },
        });
      }
    }
  }

  async onRefereeSeen(referee: { id: string; nameEn: string }): Promise<void> {
    const key = normalizeRefereeKey(referee.nameEn);
    const seed = this.seeds.getRefereeSeed(key);
    if (seed) {
      await this.applySeedEntry('referee', { ...seed, externalId: key, nameEn: referee.nameEn }, referee.id);
    }
  }

  async onCoachSeen(coach: { nameEn: string }): Promise<void> {
    const name = coach.nameEn?.trim();
    if (!name) return;
    const seed = this.seeds.getCoachSeed(name);
    if (!seed?.nameCn) return;
    const key = normalizeRefereeKey(name);
    const locked = await this.prisma.entityTranslation.findFirst({
      where: {
        entityType: 'coach',
        externalId: key,
        locale: 'zh-CN',
        field: 'name',
        locked: true,
      },
    });
    if (locked) return;
    await this.upsertTranslation({
      entityType: 'coach',
      externalId: key,
      sourceText: name,
      translatedText: seed.nameCn,
      shortText: seed.shortNameCn ?? null,
      source: 'seed',
      status: 'approved',
    });
  }

  async loadTeamsForDisplay(ids: string[]) {
    return this.prisma.team.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        nameCn: true,
        nameEn: true,
        shortNameCn: true,
        externalId: true,
        apiFootballTeamId: true,
        logoUrl: true,
      },
    });
  }

  async loadCompetitionsForDisplay(ids: string[]) {
    return this.prisma.competition.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        nameCn: true,
        nameEn: true,
        shortNameCn: true,
        code: true,
        apiSportsLeagueId: true,
      },
    });
  }

  async loadPlayersForDisplay(ids: string[]) {
    return this.prisma.player.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        nameCn: true,
        nameEn: true,
        shortNameCn: true,
        externalId: true,
      },
    });
  }

  async getCoverage(opts?: { competitionCode?: string }) {
    const teamWhere =
      opts?.competitionCode ?
        {
          OR: [
            { homeMatches: { some: { competition: { code: opts.competitionCode } } } },
            { awayMatches: { some: { competition: { code: opts.competitionCode } } } },
          ],
        }
      : {};
    const [teams, players] = await Promise.all([
      this.prisma.team.findMany({
        where: teamWhere,
        select: { id: true, nameCn: true, nameEn: true },
      }),
      this.prisma.player.findMany({
        where: opts?.competitionCode ?
          { team: teamWhere }
        : {},
        select: { id: true, nameCn: true, nameEn: true },
        take: 5000,
      }),
    ]);
    const teamTranslated = teams.filter((t) => t.nameCn.trim() !== t.nameEn.trim()).length;
    const playerTranslated = players.filter((p) => p.nameCn.trim() !== p.nameEn.trim()).length;
    return {
      teams: { total: teams.length, translated: teamTranslated },
      players: { total: players.length, translated: playerTranslated },
      teamPct: teams.length ? Math.round((teamTranslated / teams.length) * 100) : 100,
      playerPct: players.length ? Math.round((playerTranslated / players.length) * 100) : 0,
    };
  }

  async getMissing(entityType: EntityType, limit = 100) {
    if (entityType === 'team') {
      const rows = await this.prisma.team.findMany({
        select: { id: true, nameEn: true, nameCn: true, externalId: true },
        take: 500,
      });
      return rows
        .filter((r) => r.nameCn.trim() === r.nameEn.trim())
        .slice(0, limit)
        .map((r) => ({ entityType, entityId: r.id, nameEn: r.nameEn, externalId: r.externalId }));
    }
    if (entityType === 'player') {
      const rows = await this.prisma.player.findMany({
        select: { id: true, nameEn: true, nameCn: true, externalId: true },
        take: 2000,
      });
      return rows
        .filter((r) => r.nameCn.trim() === r.nameEn.trim())
        .slice(0, limit)
        .map((r) => ({ entityType, entityId: r.id, nameEn: r.nameEn, externalId: r.externalId }));
    }
    return [];
  }

  async listTranslations(filters: {
    entityType?: string;
    status?: string;
    skip?: number;
    take?: number;
  }) {
    return this.prisma.entityTranslation.findMany({
      where: {
        entityType: filters.entityType,
        status: filters.status,
      },
      orderBy: { updatedAt: 'desc' },
      skip: filters.skip ?? 0,
      take: Math.min(200, filters.take ?? 50),
    });
  }

  async generateLlmDraftBatch(opts: {
    entityTypes?: EntityType[];
    limit?: number;
  }): Promise<{ processed: number; skipped: number; errors: number }> {
    const types = (opts.entityTypes ?? ['team', 'player']).filter(
      (t): t is 'team' | 'player' => t === 'team' || t === 'player',
    );
    const max =
      opts.limit ??
      this.config.get<number>('localizationLlmDraftMaxPerRun') ??
      50;
    const limit = Math.min(200, Math.max(1, max));
    let processed = 0;
    let skipped = 0;
    let errors = 0;

    const systemPrompt =
      '你是足球实体中文译名助手。根据英文名输出 JSON：{"nameCn":"中文全称或null","shortNameCn":"可选简称","confidence":0-1}。无法可靠翻译时 nameCn 为 null。禁止编造；使用通行中文体育媒体译名。';

    for (const entityType of types) {
      const missing = await this.getMissing(entityType, limit - processed);
      for (const row of missing) {
        if (processed >= limit) break;
        const externalId = row.externalId ? String(row.externalId) : row.entityId;
        const existing = await this.prisma.entityTranslation.findFirst({
          where: {
            entityType,
            locale: 'zh-CN',
            field: 'name',
            OR: [{ entityId: row.entityId }, { externalId }],
          },
        });
        if (existing?.locked || existing?.status === 'approved') {
          skipped += 1;
          continue;
        }

        try {
          let draft: z.infer<typeof LlmDraftSchema>;
          if (shouldUseDeepseekMock(this.config)) {
            draft = {
              nameCn: `${row.nameEn}（草案）`,
              confidence: 0.5,
            };
          } else {
            draft = await this.deepseek.completeChatJson(
              systemPrompt,
              JSON.stringify({ entityType, nameEn: row.nameEn }),
              LlmDraftSchema,
            );
          }
          if (!draft.nameCn?.trim()) {
            skipped += 1;
            continue;
          }
          await this.upsertTranslation({
            entityType,
            entityId: row.entityId,
            externalId,
            sourceText: row.nameEn,
            translatedText: draft.nameCn.trim(),
            shortText: draft.shortNameCn?.trim() ?? null,
            source: 'llm',
            status: 'draft',
          });
          processed += 1;
        } catch (e) {
          errors += 1;
          const msg = e instanceof Error ? e.message : String(e);
          this.log.warn(`LLM draft ${entityType} ${row.entityId}: ${msg.slice(0, 200)}`);
        }
      }
    }
    return { processed, skipped, errors };
  }

  async importTranslationsCsv(csv: string): Promise<{ imported: number; skipped: number }> {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { imported: 0, skipped: 0 };
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const idx = {
      entityType: header.indexOf('entitytype'),
      externalId: header.indexOf('externalid'),
      translatedText: header.indexOf('translatedtext'),
      status: header.indexOf('status'),
    };
    if (idx.entityType < 0 || idx.translatedText < 0) {
      throw new Error('CSV must include entityType, translatedText columns');
    }
    let imported = 0;
    let skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const entityType = cols[idx.entityType] as EntityType;
      const translatedText = cols[idx.translatedText];
      if (!entityType || !translatedText) {
        skipped += 1;
        continue;
      }
      const externalId = idx.externalId >= 0 ? cols[idx.externalId] : 'internal';
      const status = idx.status >= 0 ? cols[idx.status] || 'draft' : 'draft';
      const locked = await this.prisma.entityTranslation.findFirst({
        where: {
          entityType,
          externalId: String(externalId),
          locale: 'zh-CN',
          field: 'name',
          locked: true,
        },
      });
      if (locked) {
        skipped += 1;
        continue;
      }
      await this.upsertTranslation({
        entityType,
        externalId: String(externalId),
        translatedText,
        source: 'csv',
        status,
      });
      imported += 1;
    }
    return { imported, skipped };
  }

  async searchEntities(q: string, limit = 20) {
    const term = q.trim();
    if (!term) return { teams: [], players: [] };
    const teams = await this.prisma.team.findMany({
      where: {
        OR: [{ nameEn: { contains: term } }, { nameCn: { contains: term } }],
      },
      take: limit,
      select: { id: true, nameCn: true, nameEn: true, externalId: true, logoUrl: true },
    });
    const players = await this.prisma.player.findMany({
      where: {
        OR: [{ nameEn: { contains: term } }, { nameCn: { contains: term } }],
      },
      take: limit,
      select: { id: true, nameCn: true, nameEn: true, externalId: true, teamId: true },
    });
    const et = await this.prisma.entityTranslation.findMany({
      where: {
        OR: [
          { translatedText: { contains: term } },
          { sourceText: { contains: term } },
        ],
      },
      take: limit * 2,
    });
    const aliasHits = et.filter((r) => {
      const aliases = (r.aliasJson as { aliases?: string[] } | null)?.aliases;
      if (!aliases?.length) return false;
      const low = term.toLowerCase();
      return aliases.some((a) => a.toLowerCase().includes(low));
    });
    const merged = [...aliasHits, ...et.filter((r) => !aliasHits.includes(r))].slice(0, limit);
    return { teams, players, translations: merged };
  }

  async exportTranslationsCsv(): Promise<string> {
    const rows = await this.prisma.entityTranslation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });
    const header = 'entityType,externalId,translatedText,status,source\n';
    const body = rows
      .map(
        (r) =>
          `${r.entityType},${r.externalId ?? ''},${JSON.stringify(r.translatedText)},${r.status},${r.source}`,
      )
      .join('\n');
    return header + body;
  }

  async computeTranslationHash(): Promise<string> {
    const agg = await this.prisma.entityTranslation.aggregate({
      _max: { updatedAt: true },
      where: { status: 'approved' },
    });
    const t = agg._max.updatedAt?.getTime() ?? 0;
    return `zh:${t}`;
  }
}
