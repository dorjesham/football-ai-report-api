export type TranslationStatus = 'approved' | 'draft' | 'fallback';

export type DisplayNameResult = {
  displayName: string;
  translationStatus: TranslationStatus;
  nameCn?: string | null;
  shortNameCn?: string | null;
};

export type SeedEntry = {
  externalSource?: string;
  externalId?: string;
  code?: string;
  nameEn?: string;
  nameCn: string;
  shortNameCn?: string;
  aliases?: string[];
};

export type EntityType =
  | 'team'
  | 'player'
  | 'competition'
  | 'referee'
  | 'coach'
  | 'city'
  | 'venue'
  | 'country';
