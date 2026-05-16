/**
 * StatsBomb Open Data `competition_id` → 本地 `Competition.code`（与 `prisma/seed.ts` 常见实例一致）。
 * 仅收录与五大联赛 / 欧冠 / 欧联 / 世界杯等可直接对应的条目；其它赛事请用手动映射批量。
 */
export const STATSBOMB_COMPETITION_ID_TO_CODE: Readonly<Record<number, string>> = {
  2: 'PL',
  7: 'FL1',
  9: 'BL1',
  11: 'PD',
  12: 'SA',
  16: 'CL',
  35: 'EL',
  43: 'WC',
};

/** 五大联赛 + 欧冠 + 欧联（不含世界杯，避免一次任务过大） */
export const STATSBOMB_PRESET_BIG5_EURO_IDS = [2, 7, 9, 11, 12, 16, 35] as const;

export type StatsbombAutoMapPreset = 'BIG5_EURO' | 'ALL_MAPPED';

export function statsbombMappingsFromPreset(
  preset: StatsbombAutoMapPreset,
): { sbCompetitionId: number; competitionCode: string }[] {
  if (preset === 'BIG5_EURO') {
    return STATSBOMB_PRESET_BIG5_EURO_IDS.map((id) => ({
      sbCompetitionId: id,
      competitionCode: STATSBOMB_COMPETITION_ID_TO_CODE[id]!,
    }));
  }
  return Object.keys(STATSBOMB_COMPETITION_ID_TO_CODE).map((k) => {
    const id = Number(k);
    return {
      sbCompetitionId: id,
      competitionCode: STATSBOMB_COMPETITION_ID_TO_CODE[id]!,
    };
  });
}
