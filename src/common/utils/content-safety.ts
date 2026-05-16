import { BANNED_WORDS } from '../constants/banned-words.constant';

const REPLACEMENTS: [RegExp, string][] = [
  [/大小球投注/g, '总进球趋势'],
  [/盘口/g, '市场关注点'],
  [/稳胆/g, '高关注场次'],
  [/必中/g, ''],
];

export function containsBannedWords(text: string): boolean {
  if (!text) return false;
  return BANNED_WORDS.some((w) => text.includes(w));
}

export function collectBannedWords(obj: unknown): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      BANNED_WORDS.forEach((w) => {
        if (v.includes(w)) found.add(w);
      });
    } else if (v && typeof v === 'object') {
      Object.values(v as object).forEach(walk);
    }
  };
  walk(obj);
  return [...found];
}

export function sanitizeAiReportText(text: string): { text: string; warnings: string[] } {
  let t = text;
  const warnings: string[] = [];
  for (const [re, rep] of REPLACEMENTS) {
    if (re.test(t)) {
      warnings.push(`replaced pattern ${re}`);
      t = t.replace(re, rep);
    }
  }
  return { text: t, warnings };
}

export function validateReportBeforePublish(report: {
  disclaimer?: string;
  freeSummary?: string;
}): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const json = JSON.stringify(report);
  if (containsBannedWords(json)) {
    reasons.push('banned_words_present');
  }
  return { ok: reasons.length === 0, reasons };
}
