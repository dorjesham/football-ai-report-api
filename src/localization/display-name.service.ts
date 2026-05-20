import { Injectable } from '@nestjs/common';
import { LocalizationSeedLoader } from './localization-seed.loader';
import { LocalizationService } from './localization.service';
import type { DisplayNameResult, TranslationStatus } from './localization.types';
import { parseAfPlayerId, parseAfTeamId } from './referee-name.util';

type TeamLike = {
  id?: string;
  nameCn: string;
  nameEn: string;
  shortNameCn?: string | null;
  externalId?: string | null;
  apiFootballTeamId?: number | null;
};

type CompetitionLike = {
  id?: string;
  nameCn: string;
  nameEn: string;
  shortNameCn?: string | null;
  code?: string | null;
  apiSportsLeagueId?: number | null;
};

type PlayerLike = {
  id?: string;
  nameCn: string;
  nameEn: string;
  shortNameCn?: string | null;
  externalId?: string | null;
};

@Injectable()
export class DisplayNameService {
  constructor(
    private readonly seeds: LocalizationSeedLoader,
    private readonly l10n: LocalizationService,
  ) {}

  private hasRealCn(nameCn: string, nameEn: string): boolean {
    const cn = nameCn?.trim();
    const en = nameEn?.trim();
    return !!cn && cn !== en;
  }

  private buildResult(
    nameEn: string,
    nameCn: string | null | undefined,
    shortNameCn: string | null | undefined,
    status: TranslationStatus,
  ): DisplayNameResult {
    const en = nameEn?.trim() || '未知';
    const displayName =
      status === 'approved' && nameCn?.trim() ?
        nameCn.trim()
      : status === 'draft' && nameCn?.trim() ?
        nameCn.trim()
      : en;
    return {
      displayName,
      translationStatus: status,
      nameCn: nameCn ?? null,
      shortNameCn: shortNameCn ?? null,
    };
  }

  resolveTeam(team: TeamLike): DisplayNameResult {
    const afId = parseAfTeamId(team.externalId, team.apiFootballTeamId);
    const seed = this.seeds.getTeamSeed(afId, team.nameEn);
    if (seed?.nameCn) {
      return this.buildResult(team.nameEn, seed.nameCn, seed.shortNameCn, 'approved');
    }
    if (this.hasRealCn(team.nameCn, team.nameEn)) {
      return this.buildResult(team.nameEn, team.nameCn, team.shortNameCn, 'approved');
    }
    return this.buildResult(team.nameEn, null, null, 'fallback');
  }

  resolveCompetition(comp: CompetitionLike): DisplayNameResult {
    const seed = this.seeds.getCompetitionSeed(comp.apiSportsLeagueId ?? null, comp.code);
    if (seed?.nameCn) {
      return this.buildResult(comp.nameEn, seed.nameCn, seed.shortNameCn, 'approved');
    }
    if (this.hasRealCn(comp.nameCn, comp.nameEn)) {
      return this.buildResult(comp.nameEn, comp.nameCn, comp.shortNameCn, 'approved');
    }
    return this.buildResult(comp.nameEn, null, null, 'fallback');
  }

  resolvePlayer(player: PlayerLike): DisplayNameResult {
    const afId = parseAfPlayerId(player.externalId);
    const seed = this.seeds.getPlayerSeed(afId);
    if (seed?.nameCn) {
      return this.buildResult(player.nameEn, seed.nameCn, seed.shortNameCn, 'approved');
    }
    if (this.hasRealCn(player.nameCn, player.nameEn)) {
      return this.buildResult(player.nameEn, player.nameCn, player.shortNameCn, 'approved');
    }
    return this.buildResult(player.nameEn, null, null, 'fallback');
  }

  async teamsByIds(ids: string[]): Promise<Map<string, DisplayNameResult>> {
    const out = new Map<string, DisplayNameResult>();
    if (!ids.length) return out;
    const teams = await this.l10n.loadTeamsForDisplay(ids);
    const translations = await this.l10n.getApprovedByEntityIds('team', ids);
    for (const t of teams) {
      const tr = translations.get(t.id);
      if (tr) {
        out.set(t.id, this.buildResult(t.nameEn, tr.translatedText, tr.shortText, 'approved'));
        continue;
      }
      out.set(t.id, this.resolveTeam(t));
    }
    return out;
  }

  async competitionsByIds(ids: string[]): Promise<Map<string, DisplayNameResult>> {
    const out = new Map<string, DisplayNameResult>();
    if (!ids.length) return out;
    const rows = await this.l10n.loadCompetitionsForDisplay(ids);
    const translations = await this.l10n.getApprovedByEntityIds('competition', ids);
    for (const c of rows) {
      const tr = translations.get(c.id);
      if (tr) {
        out.set(c.id, this.buildResult(c.nameEn, tr.translatedText, tr.shortText, 'approved'));
        continue;
      }
      out.set(c.id, this.resolveCompetition(c));
    }
    return out;
  }

  async playersByIds(ids: string[]): Promise<Map<string, DisplayNameResult>> {
    const out = new Map<string, DisplayNameResult>();
    if (!ids.length) return out;
    const rows = await this.l10n.loadPlayersForDisplay(ids);
    const translations = await this.l10n.getApprovedByEntityIds('player', ids);
    for (const p of rows) {
      const tr = translations.get(p.id);
      if (tr) {
        out.set(p.id, this.buildResult(p.nameEn, tr.translatedText, tr.shortText, 'approved'));
        continue;
      }
      out.set(p.id, this.resolvePlayer(p));
    }
    return out;
  }

  enrichTeam<T extends TeamLike & { logoUrl?: string | null }>(
    team: T,
  ): T & DisplayNameResult & { logoUrl?: string | null } {
    const r = this.resolveTeam(team);
    return { ...team, ...r };
  }

  enrichCompetition<T extends CompetitionLike>(comp: T): T & DisplayNameResult {
    return { ...comp, ...this.resolveCompetition(comp) };
  }

  enrichPlayer<T extends PlayerLike>(player: T): T & DisplayNameResult {
    return { ...player, ...this.resolvePlayer(player) };
  }
}
