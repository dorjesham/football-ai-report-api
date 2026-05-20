export const MATCH_SPATIAL_SCHEMA = 'match-spatial-v1' as const;

export type SpatialPoint = {
  x: number;
  y: number;
  teamSide: 'home' | 'away' | null;
  kind: 'pass' | 'shot';
};

export type SpatialBin = {
  xBin: number;
  yBin: number;
  count: number;
  teamSide: 'home' | 'away' | null;
};

export type MatchSpatialSection = {
  schema: typeof MATCH_SPATIAL_SCHEMA;
  dataSource: 'STATSBOMB';
  availability: 'present' | 'missing';
  pitch: { length: number; width: number };
  passes: SpatialPoint[];
  shots: SpatialPoint[];
  bins: SpatialBin[];
  dataQuality: string;
};

const BINS_X = 6;
const BINS_Y = 5;

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function readXY(loc: unknown): { x: number; y: number } | null {
  const l = asRecord(loc);
  if (!l) return null;
  const x = Number(l[0] ?? l.x);
  const y = Number(l[1] ?? l.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function teamSideFromSb(
  teamName: string | null,
  homeName: string | null,
  awayName: string | null,
): 'home' | 'away' | null {
  if (!teamName) return null;
  const n = teamName.toLowerCase();
  if (homeName && n.includes(homeName.toLowerCase().slice(0, 6))) return 'home';
  if (awayName && n.includes(awayName.toLowerCase().slice(0, 6))) return 'away';
  return null;
}

function extractEventsArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const o = asRecord(raw);
  if (o?.schema === 'statsbomb-events-cap-v1' && Array.isArray(o.events)) {
    return o.events;
  }
  if (Array.isArray(o?.eventsSample)) return o.eventsSample;
  return [];
}

export function extractStatsbombSpatial(args: {
  rawStatsbomb: unknown;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
}): MatchSpatialSection {
  const empty: MatchSpatialSection = {
    schema: MATCH_SPATIAL_SCHEMA,
    dataSource: 'STATSBOMB',
    availability: 'missing',
    pitch: { length: 120, width: 80 },
    passes: [],
    shots: [],
    bins: [],
    dataQuality: 'MISSING',
  };

  const raw = asRecord(args.rawStatsbomb);
  const events = extractEventsArray(raw?.events ?? raw);
  if (events.length === 0) return empty;

  const passes: SpatialPoint[] = [];
  const shots: SpatialPoint[] = [];

  for (const ev of events) {
    const e = asRecord(ev);
    if (!e) continue;
    const typeRec = asRecord(e.type);
    const typeName = String(typeRec?.name ?? e.type ?? '').toLowerCase();
    const teamName =
      typeof asRecord(e.team)?.name === 'string' ?
        String(asRecord(e.team)!.name)
      : null;
    const side = teamSideFromSb(teamName, args.homeTeamName ?? null, args.awayTeamName ?? null);
    const loc = readXY(e.location);
    if (!loc) continue;

    if (typeName.includes('pass')) {
      passes.push({ ...loc, teamSide: side, kind: 'pass' });
    } else if (typeName.includes('shot')) {
      shots.push({ ...loc, teamSide: side, kind: 'shot' });
    }
  }

  if (passes.length === 0 && shots.length === 0) return empty;

  const binsMap = new Map<string, SpatialBin>();
  const addBin = (p: SpatialPoint) => {
    const xBin = Math.min(BINS_X - 1, Math.max(0, Math.floor((p.x / 120) * BINS_X)));
    const yBin = Math.min(BINS_Y - 1, Math.max(0, Math.floor((p.y / 80) * BINS_Y)));
    const key = `${p.teamSide ?? 'n'}:${xBin}:${yBin}`;
    const cur = binsMap.get(key) ?? {
      xBin,
      yBin,
      count: 0,
      teamSide: p.teamSide,
    };
    cur.count += 1;
    binsMap.set(key, cur);
  };
  for (const p of [...passes, ...shots]) addBin(p);

  return {
    schema: MATCH_SPATIAL_SCHEMA,
    dataSource: 'STATSBOMB',
    availability: 'present',
    pitch: { length: 120, width: 80 },
    passes: passes.slice(0, 800),
    shots: shots.slice(0, 200),
    bins: [...binsMap.values()],
    dataQuality: 'STATSBOMB_OPEN_DATA',
  };
}
