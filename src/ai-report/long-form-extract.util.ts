import {
  PreMatchIntelLongV1Schema,
  PostMatchTacticalLongV1Schema,
} from './schemas/facts-envelope.schema';
import { PostMatchStructuredV1Schema } from './schemas/structured-report.schema';

export type LongFormTeaser = {
  markdown: string;
  sections?: Record<string, string>;
  locked?: boolean;
  teaser?: string;
};

export function extractPreMatchIntelLong(
  structuredContentJson: unknown,
  isUnlocked: boolean,
): LongFormTeaser | null {
  if (!structuredContentJson || typeof structuredContentJson !== 'object') return null;
  const raw = (structuredContentJson as Record<string, unknown>).preMatchIntelLongV1;
  const parsed = PreMatchIntelLongV1Schema.safeParse(raw);
  if (!parsed.success) return null;
  if (isUnlocked) {
    return { markdown: parsed.data.markdown, sections: parsed.data.sections };
  }
  return {
    markdown: parsed.data.markdown.slice(0, 400),
    teaser: parsed.data.markdown.slice(0, 400),
    locked: true,
  };
}

export function extractPostMatchTacticalLong(
  structuredContentJson: unknown,
  isUnlocked: boolean,
): LongFormTeaser | null {
  if (!structuredContentJson || typeof structuredContentJson !== 'object') return null;
  const raw = (structuredContentJson as Record<string, unknown>).tacticalLongV1;
  const parsed = PostMatchTacticalLongV1Schema.safeParse(raw);
  if (!parsed.success) return null;
  if (isUnlocked) {
    return { markdown: parsed.data.markdown, sections: parsed.data.sections };
  }
  return {
    markdown: parsed.data.markdown.slice(0, 400),
    teaser: parsed.data.markdown.slice(0, 400),
    locked: true,
  };
}

export function extractPostMatchStructured(structuredContentJson: unknown) {
  return PostMatchStructuredV1Schema.safeParse(structuredContentJson);
}
