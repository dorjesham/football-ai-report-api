/** 从 FD 或第三方 JSON 中尽量提取人物头像 URL（若 API 未来增加字段可自动吃到）。 */
const IMAGE_KEYS = [
  'photo',
  'image',
  'picture',
  'avatar',
  'avatarUrl',
  'headshot',
  'profilePhoto',
  'portrait',
] as const;

const URL_LIKE =
  /^https?:\/\/.+/i;

function looksLikeImageUrl(s: string): boolean {
  const t = s.trim();
  if (!URL_LIKE.test(t)) return false;
  return /\.(jpe?g|png|webp|svg|gif)(\?|$)/i.test(t) || /\/image\/|\/img\/|i\.imgur\.com/i.test(t);
}

export function pickFirstHttpImageUrlFromUnknown(root: unknown): string | null {
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
  const o = root as Record<string, unknown>;
  for (const k of IMAGE_KEYS) {
    const v = o[k];
    if (typeof v === 'string' && looksLikeImageUrl(v)) return v.trim();
  }
  for (const nk of ['currentTeam', 'team'] as const) {
    const inner = o[nk];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const u = pickFirstHttpImageUrlFromUnknown(inner);
      if (u) return u;
    }
  }
  return null;
}
