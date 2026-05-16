/** 解析 FBref 导出的「球员统计」类 CSV（RFC4180 风格，含引号字段）。 */

export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    if (!inQuotes && c === '\r') continue;
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function normalizeHeaderCell(h: string): string {
  return h.replace(/^\uFEFF/, '').trim();
}

/** 归一化队名用于模糊匹配（去重音、常见后缀、标点）。 */
export function normalizeClubKey(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\./g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(fc|afc|cf|sc|club)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return base;
}

/** 归一化球员显示名（与队名策略接近）。 */
export function normalizePlayerKey(name: string): string {
  return normalizeClubKey(name);
}

function headerHasPlayerAndSquad(cells: string[]): boolean {
  const lower = cells.map((c) => normalizeHeaderCell(c).toLowerCase());
  const hasPlayer = lower.some((h) => h === 'player');
  const hasSquad = lower.some((h) => h === 'squad' || h === 'team');
  return hasPlayer && hasSquad;
}

export type FbrefParsedTable = {
  headerRowIndex: number;
  headers: string[];
  /** 数据行（不含表头），每行与 headers 等长（不足则补空）。 */
  dataRows: string[][];
};

/**
 * 在文件前若干行内定位 FBref 表头行（含 Player + Squad/Team）。
 * FBref 常见：首行为联赛说明、次行为多级表头——此处取同时含 Player 与 Squad 的第一行。
 */
export function parseFbrefPlayerStatsTable(text: string): FbrefParsedTable {
  const raw = stripBom(text);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let headerRowIndex = -1;
  let headers: string[] = [];
  const maxScan = Math.min(lines.length, 40);
  for (let i = 0; i < maxScan; i++) {
    const cells = parseCsvLine(lines[i]).map(normalizeHeaderCell);
    if (headerHasPlayerAndSquad(cells)) {
      headerRowIndex = i;
      headers = cells;
      break;
    }
  }
  if (headerRowIndex < 0 || headers.length === 0) {
    throw new Error(
      '未找到 FBref 表头：需要同时包含列名 Player 与 Squad（或 Team）。请确认导出为「球员统计」CSV。',
    );
  }
  const dataRows: string[][] = [];
  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length === 1 && cells[0] === '') continue;
    const playerIdx = headers.findIndex(
      (h) => normalizeHeaderCell(h).toLowerCase() === 'player',
    );
    const playerCell =
      playerIdx >= 0 ? (cells[playerIdx] ?? '').trim() : (cells[1] ?? '').trim();
    if (!playerCell || playerCell.toLowerCase() === 'player') continue;
    if (/^squad\s+total/i.test(playerCell) || /^league\s+average/i.test(playerCell)) {
      continue;
    }
    const padded =
      cells.length >= headers.length ?
        cells.slice(0, headers.length)
      : [...cells, ...Array(headers.length - cells.length).fill('')];
    dataRows.push(padded);
  }
  return { headerRowIndex, headers, dataRows };
}

/** 将表头映射为驼峰键（用于 profile JSON）；未知列保留原名（trim）。 */
export function headerToFieldKey(h: string): string {
  const t = normalizeHeaderCell(h).replace(/\s+/g, ' ').trim();
  if (!t) return 'col';
  const known: Record<string, string> = {
    Rk: 'rk',
    rk: 'rk',
    Player: 'player',
    player: 'player',
    Nation: 'nation',
    nation: 'nation',
    Pos: 'pos',
    pos: 'pos',
    Age: 'age',
    age: 'age',
    Squad: 'squad',
    squad: 'squad',
    Team: 'squad',
    team: 'squad',
    MP: 'mp',
    mp: 'mp',
    Starts: 'starts',
    starts: 'starts',
    Min: 'min',
    min: 'min',
    '90s': 'ninetyMinutes',
    '90S': 'ninetyMinutes',
    Gls: 'goals',
    gls: 'goals',
    Ast: 'assists',
    ast: 'assists',
    xG: 'xg',
    npxG: 'npxg',
    xAG: 'xag',
    PrgC: 'prgc',
    PrgP: 'prgp',
    PrgR: 'prgr',
    CrdY: 'crdY',
    CrdR: 'crdR',
  };
  if (known[t]) return known[t];
  const slug = t
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w, i) =>
      i === 0 ?
        w.charAt(0).toLowerCase() + w.slice(1)
      : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join('');
  return slug || 'col';
}

export function parseNumericCell(v: string): number | null {
  const s = v.trim();
  if (!s || s === '') return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function parseIntCell(v: string): number | null {
  const n = parseNumericCell(v);
  if (n == null) return null;
  const i = Math.round(n);
  return Number.isFinite(i) ? i : null;
}
