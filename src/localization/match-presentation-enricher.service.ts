import { Injectable } from '@nestjs/common';
import { DisplayNameService } from './display-name.service';
import { FootballDictionaryService } from './football-dictionary.service';
import type { DisplayNameResult, TranslationStatus } from './localization.types';

export type TeamPresentationFields = {
  nameCn: string;
  nameEn: string;
  externalId?: string | null;
  apiFootballTeamId?: number | null;
  displayName: string;
  translationStatus: TranslationStatus;
};

export type CompetitionPresentationFields = {
  nameCn: string;
  nameEn: string;
  code?: string | null;
  apiSportsLeagueId?: number | null;
  displayName: string;
  translationStatus: TranslationStatus;
};

@Injectable()
export class MatchPresentationEnricherService {
  constructor(
    private readonly displayName: DisplayNameService,
    private readonly dict: FootballDictionaryService,
  ) {}

  enrichTeam<T extends { nameCn: string; nameEn: string; externalId?: string | null; apiFootballTeamId?: number | null }>(
    team: T,
  ): T & DisplayNameResult {
    return { ...team, ...this.displayName.resolveTeam(team) };
  }

  enrichCompetition<
    T extends {
      nameCn: string;
      nameEn: string;
      code?: string | null;
      apiSportsLeagueId?: number | null;
    },
  >(comp: T): T & DisplayNameResult {
    return { ...comp, ...this.displayName.resolveCompetition(comp) };
  }

  enrichPlayer<T extends { nameCn: string; nameEn: string; externalId?: string | null }>(
    player: T,
  ): T & DisplayNameResult {
    return { ...player, ...this.displayName.resolvePlayer(player) };
  }

  statusCn(status: string): string | null {
    return this.dict.matchStatusCn(status);
  }

  enrichEvent<T extends { type: string; detail?: string | null }>(
    ev: T,
  ): T & { typeCn: string | null; detailCn: string | null } {
    return {
      ...ev,
      typeCn: this.dict.eventTypeCn(ev.type) ?? this.dict.statTypeCn(ev.type),
      detailCn: ev.detail ? this.dict.eventTypeCn(ev.detail) : null,
    };
  }

  enrichEvents<T extends { type: string; detail?: string | null }>(events: T[]) {
    return events.map((e) => this.enrichEvent(e));
  }

  async teamDisplayNamesByIds(ids: string[]) {
    return this.displayName.teamsByIds(ids);
  }

  oddsMarketCn(market: string | null | undefined): string | null {
    return this.dict.oddsMarketCn(market);
  }

  /** Batch-enrich match list rows (home/away/competition). */
  async enrichMatchList<
    T extends {
      id: string;
      status: string;
      homeTeamId: string;
      awayTeamId: string;
      competitionId: string;
      homeTeam: { id: string; nameCn: string; nameEn: string; externalId?: string | null; apiFootballTeamId?: number | null };
      awayTeam: { id: string; nameCn: string; nameEn: string; externalId?: string | null; apiFootballTeamId?: number | null };
      competition: { id: string; nameCn: string; nameEn: string; code?: string | null; apiSportsLeagueId?: number | null };
    },
  >(rows: T[]) {
    const teamIds = [...new Set(rows.flatMap((m) => [m.homeTeamId, m.awayTeamId]))];
    const compIds = [...new Set(rows.map((m) => m.competitionId))];
    const [teamMap, compMap] = await Promise.all([
      this.displayName.teamsByIds(teamIds),
      this.displayName.competitionsByIds(compIds),
    ]);
    return rows.map((m) => ({
      ...m,
      statusCn: this.statusCn(String(m.status)),
      homeTeam: { ...m.homeTeam, ...(teamMap.get(m.homeTeamId) ?? this.displayName.resolveTeam(m.homeTeam)) },
      awayTeam: { ...m.awayTeam, ...(teamMap.get(m.awayTeamId) ?? this.displayName.resolveTeam(m.awayTeam)) },
      competition: {
        ...m.competition,
        ...(compMap.get(m.competitionId) ?? this.displayName.resolveCompetition(m.competition)),
      },
    }));
  }
}
