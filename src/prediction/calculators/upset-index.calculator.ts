import { clamp } from '../../common/utils/clamp';

export type UpsetInput = {
  eloDiff: number;
  rankDiff?: number | null;
  favoriteInjuryImpact: number;
  favoriteFatigue: number;
  underdogRecentForm: number;
  weatherRough: boolean;
  isNeutral?: boolean;
};

export function calculateUpsetIndex(input: UpsetInput): { upsetIndex: number; explanation: string } {
  const tightness = clamp(100 - Math.abs(input.eloDiff) / 5, 0, 100);
  const rank = clamp((input.rankDiff ?? 5) * 4, 0, 100);
  const inj = clamp(input.favoriteInjuryImpact * 2.5, 0, 100);
  const fat = clamp(input.favoriteFatigue * 2.5, 0, 100);
  const form = clamp(input.underdogRecentForm * 0.6, 0, 100);
  const wx = input.weatherRough ? 12 : 0;

  const upsetIndex = Math.round(
    clamp(tightness * 0.28 + rank * 0.12 + inj * 0.2 + fat * 0.15 + form * 0.2 + wx, 0, 100),
  );

  return {
    upsetIndex,
    explanation:
      '冷门指数综合了实力差距、伤病与疲劳、近况与天气扰动等因素，数值越高表示不确定性相对更高，不代表赛果。',
  };
}
