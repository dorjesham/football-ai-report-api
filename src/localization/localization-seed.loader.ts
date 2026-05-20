import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { resolveLocalizationDataDir } from './localization-path.util';
import type { SeedEntry } from './localization.types';

const SEED_FILES = [
  'competitions.json',
  'teams.popular.json',
  'teams.worldcup2026.json',
  'players.popular.json',
  'players.worldcup2026.json',
  'countries.json',
  'cities.json',
  'venues.worldcup2026.json',
  'referees.json',
  'coaches.json',
] as const;

@Injectable()
export class LocalizationSeedLoader implements OnModuleInit {
  private readonly log = new Logger(LocalizationSeedLoader.name);

  private teamByAfId = new Map<string, SeedEntry>();
  private teamByNameEn = new Map<string, SeedEntry>();
  private competitionByAfId = new Map<string, SeedEntry>();
  private competitionByCode = new Map<string, SeedEntry>();
  private playerByAfId = new Map<string, SeedEntry>();
  private refereeByKey = new Map<string, SeedEntry>();
  private coachByKey = new Map<string, SeedEntry>();
  private cityByEn = new Map<string, SeedEntry>();
  private countryByEn = new Map<string, SeedEntry>();

  onModuleInit(): void {
    this.reload();
  }

  reload(): void {
    this.clear();
    const dir = resolveLocalizationDataDir();
    for (const file of SEED_FILES) {
      this.loadFile(join(dir, file));
    }
    this.log.log(
      `Seed maps: teams=${this.teamByAfId.size} competitions=${this.competitionByAfId.size} players=${this.playerByAfId.size}`,
    );
  }

  private clear(): void {
    this.teamByAfId.clear();
    this.teamByNameEn.clear();
    this.competitionByAfId.clear();
    this.competitionByCode.clear();
    this.playerByAfId.clear();
    this.refereeByKey.clear();
    this.coachByKey.clear();
    this.cityByEn.clear();
    this.countryByEn.clear();
  }

  private loadFile(path: string): void {
    try {
      const raw = readFileSync(path, 'utf8');
      const rows = JSON.parse(raw) as SeedEntry[];
      if (!Array.isArray(rows)) return;
      const base = path.split('/').pop() ?? '';
      for (const row of rows) {
        if (!row?.nameCn) continue;
        if (base.startsWith('teams.')) {
          if (row.externalId) this.teamByAfId.set(String(row.externalId), row);
          if (row.nameEn) this.teamByNameEn.set(row.nameEn.toLowerCase(), row);
        } else if (base === 'competitions.json') {
          if (row.externalId) this.competitionByAfId.set(String(row.externalId), row);
          if (row.code) this.competitionByCode.set(row.code.toUpperCase(), row);
        } else if (base.startsWith('players.')) {
          if (row.externalId) this.playerByAfId.set(String(row.externalId), row);
        } else if (base === 'referees.json') {
          const key = (row.nameEn ?? row.externalId ?? '').toLowerCase();
          if (key) this.refereeByKey.set(key, row);
        } else if (base === 'coaches.json') {
          const key = (row.nameEn ?? row.externalId ?? '').toLowerCase();
          if (key) this.coachByKey.set(key, row);
        } else if (base === 'cities.json') {
          if (row.nameEn) this.cityByEn.set(row.nameEn.toLowerCase(), row);
        } else if (base === 'countries.json') {
          if (row.nameEn) this.countryByEn.set(row.nameEn.toLowerCase(), row);
        }
      }
    } catch {
      /* optional files */
    }
  }

  getTeamSeed(apiFootballTeamId?: number | null, nameEn?: string | null): SeedEntry | null {
    if (apiFootballTeamId != null) {
      const hit = this.teamByAfId.get(String(apiFootballTeamId));
      if (hit) return hit;
    }
    if (nameEn) return this.teamByNameEn.get(nameEn.toLowerCase()) ?? null;
    return null;
  }

  getCompetitionSeed(apiSportsLeagueId?: number | null, code?: string | null): SeedEntry | null {
    if (apiSportsLeagueId != null) {
      const hit = this.competitionByAfId.get(String(apiSportsLeagueId));
      if (hit) return hit;
    }
    if (code) return this.competitionByCode.get(code.toUpperCase()) ?? null;
    return null;
  }

  getPlayerSeed(apiFootballPlayerId?: number | null): SeedEntry | null {
    if (apiFootballPlayerId == null) return null;
    return this.playerByAfId.get(String(apiFootballPlayerId)) ?? null;
  }

  getRefereeSeed(normalizedKey: string): SeedEntry | null {
    return this.refereeByKey.get(normalizedKey.toLowerCase()) ?? null;
  }

  getCoachSeed(nameEn: string): SeedEntry | null {
    return this.coachByKey.get(nameEn.toLowerCase()) ?? null;
  }

  getCitySeed(cityEn: string): SeedEntry | null {
    return this.cityByEn.get(cityEn.toLowerCase()) ?? null;
  }

  listSeedFiles(): string[] {
    const dir = resolveLocalizationDataDir();
    try {
      return readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
      return [...SEED_FILES];
    }
  }
}
