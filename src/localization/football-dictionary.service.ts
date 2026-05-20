import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveLocalizationDataDir } from './localization-path.util';

export type FootballDictionaryCategory =
  | 'matchStatus'
  | 'positions'
  | 'events'
  | 'statistics'
  | 'lineupRoles'
  | 'oddsMarkets';

type DictionaryRoot = Partial<Record<FootballDictionaryCategory, Record<string, string>>>;

@Injectable()
export class FootballDictionaryService implements OnModuleInit {
  private readonly log = new Logger(FootballDictionaryService.name);
  private dict: DictionaryRoot = {};

  onModuleInit(): void {
    this.reload();
  }

  reload(): void {
    const dir = resolveLocalizationDataDir();
    const path = join(dir, 'football-dictionaries.json');
    try {
      const raw = readFileSync(path, 'utf8');
      this.dict = JSON.parse(raw) as DictionaryRoot;
      this.log.log(`Loaded football dictionaries from ${path}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`football-dictionaries.json not loaded (${path}): ${msg}`);
      this.dict = {};
    }
  }

  translate(category: FootballDictionaryCategory, key: string | null | undefined): string | null {
    if (!key || !String(key).trim()) return null;
    const k = String(key).trim();
    const map = this.dict[category];
    if (!map) return null;
    return map[k] ?? map[k.toLowerCase()] ?? null;
  }

  matchStatusCn(short: string | null | undefined): string | null {
    return this.translate('matchStatus', short);
  }

  eventTypeCn(type: string | null | undefined): string | null {
    return this.translate('events', type);
  }

  statTypeCn(type: string | null | undefined): string | null {
    return this.translate('statistics', type);
  }

  positionCn(pos: string | null | undefined): string | null {
    return this.translate('positions', pos);
  }

  lineupRoleCn(role: string | null | undefined): string | null {
    return this.translate('lineupRoles', role);
  }

  oddsMarketCn(market: string | null | undefined): string | null {
    return this.translate('oddsMarkets', market);
  }

  /** Attach typeCn to objects with a `type` field. */
  withTypeCn<T extends { type?: string | null }>(row: T): T & { typeCn: string | null } {
    return { ...row, typeCn: this.eventTypeCn(row.type) ?? this.statTypeCn(row.type) };
  }
}
