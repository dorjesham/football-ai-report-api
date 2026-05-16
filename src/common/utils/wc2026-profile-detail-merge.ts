import type { Wc2026ProfileDetailKey } from '../constants/wc2026-profile-detail.keys';
import { WC2026_PROFILE_DETAIL_KEYS } from '../constants/wc2026-profile-detail.keys';

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

/** 仅从 overrides 文件对象中取出允许的 profile 键（含显式 null，用于清空） */
export function pickWc2026DetailFromOverride(
  ov: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of WC2026_PROFILE_DETAIL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(ov, k)) {
      out[k] = ov[k];
    }
  }
  return out;
}

/**
 * 合并：base（FIFA/Elo/近期赛等） + 文件 extras；若某展示键在文件中未出现，则保留库内已有值（运营 PATCH）。
 */
export function mergeWc2026ProfileWithExisting(
  base: Record<string, unknown>,
  fileExtras: Record<string, unknown>,
  existingProfile: unknown,
): Record<string, unknown> {
  const prev = asRecord(existingProfile) ?? {};
  const out: Record<string, unknown> = { ...base, ...fileExtras };
  for (const k of WC2026_PROFILE_DETAIL_KEYS) {
    const key = k as Wc2026ProfileDetailKey;
    if (!Object.prototype.hasOwnProperty.call(fileExtras, key) && prev[key] !== undefined) {
      out[key] = prev[key];
    }
  }
  return out;
}

/** 管理端 PATCH：仅覆盖 patch 中出现的展示键，其余 `wc2026Profile` 子键不变。 */
export function applyWc2026DetailPatchToProfile(
  existingProfile: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const prev = asRecord(existingProfile) ?? {};
  const next: Record<string, unknown> = { ...prev };
  for (const k of WC2026_PROFILE_DETAIL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      next[k as string] = patch[k as string];
    }
  }
  return next;
}
