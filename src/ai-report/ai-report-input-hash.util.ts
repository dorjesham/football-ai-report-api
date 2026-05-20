import { createHash } from 'crypto';

const PROMPT_VERSION = 'v3-bundle-intel-1';

export function aiReportPromptVersion(): string {
  return PROMPT_VERSION;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export type AiReportHashInput = {
  fixtureJson?: unknown;
  injuriesJson?: unknown;
  predictionsJson?: unknown;
  lineupsJson?: unknown;
  statisticsJson?: unknown;
  playersJson?: unknown;
  oddsLatestJson?: unknown;
  h2hJson?: unknown;
  homeSnapshotHash?: string | null;
  awaySnapshotHash?: string | null;
  weatherSnapshotHash?: string | null;
  activePredictionInputsHash?: string | null;
};

export function computeAiReportInputHash(input: AiReportHashInput): string {
  const payload = {
    fixtureJson: input.fixtureJson ?? null,
    injuriesJson: input.injuriesJson ?? null,
    predictionsJson: input.predictionsJson ?? null,
    lineupsJson: input.lineupsJson ?? null,
    statisticsJson: input.statisticsJson ?? null,
    playersJson: input.playersJson ?? null,
    oddsLatestJson: input.oddsLatestJson ?? null,
    h2hJson: input.h2hJson ?? null,
    homeSnapshotHash: input.homeSnapshotHash ?? null,
    awaySnapshotHash: input.awaySnapshotHash ?? null,
    weatherSnapshotHash: input.weatherSnapshotHash ?? null,
    activePredictionInputsHash: input.activePredictionInputsHash ?? null,
  };
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function bundleSourceDataUpdatedAt(syncedAt?: Date | null): Date | null {
  return syncedAt ?? null;
}
