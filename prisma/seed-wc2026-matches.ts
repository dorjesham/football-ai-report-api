import * as fs from 'node:fs';
import * as path from 'node:path';
import { DataSourceType, MatchStatus, type PrismaClient } from '@prisma/client';

/**
 * 为 `seed-comp-wc` 写入 **小组赛占位** 赛程（12 组×6 场，共 72 场），主客队均为 `wc26-*` 国家队。
 * 开球时间为占位 UTC，便于前端联调 `GET /competitions/:id/worldcup2026-schedule/:teamId`；正式数据可后续由 FD/运营替换。
 */
export async function seedWc2026GroupStagePlaceholderMatches(
  prisma: PrismaClient,
  opts: { competitionId: string; tournamentId: string; seasonId: string },
): Promise<{ matchesUpserted: number }> {
  const jsonPath = path.join(__dirname, '..', 'worldcup2026_teams.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as {
    teams: Array<{ code: string; group: string }>;
  };

  const byGroup: Record<string, string[]> = {};
  for (const t of data.teams) {
    if (!byGroup[t.group]) byGroup[t.group] = [];
    byGroup[t.group].push(t.code);
  }

  const baseKickoff = new Date('2026-06-11T18:00:00.000Z');
  let slot = 0;
  let n = 0;

  for (const g of Object.keys(byGroup).sort()) {
    const codes = byGroup[g];
    if (codes.length !== 4) {
      // eslint-disable-next-line no-console
      console.warn(`WC2026 seed: group ${g} has ${codes.length} teams, skip`);
      continue;
    }
    const sorted = [...codes].sort();
    const [c1, c2, c3, c4] = sorted;

    const resolve = async (code: string) => {
      const row = await prisma.team.findUnique({
        where: { externalId: `wc26-${code}` },
        select: { id: true },
      });
      return row?.id ?? null;
    };

    const id1 = await resolve(c1);
    const id2 = await resolve(c2);
    const id3 = await resolve(c3);
    const id4 = await resolve(c4);
    if (!id1 || !id2 || !id3 || !id4) {
      // eslint-disable-next-line no-console
      console.warn(`WC2026 seed: missing team id in group ${g}`);
      continue;
    }

    const fixtures: Array<[string, string, string, string]> = [
      [c1, c2, id1, id2],
      [c3, c4, id3, id4],
      [c1, c3, id1, id3],
      [c2, c4, id2, id4],
      [c1, c4, id1, id4],
      [c2, c3, id2, id3],
    ];

    for (const [hc, ac, hid, aid] of fixtures) {
      const mid = `seed-wc26m-${g}-${hc}-vs-${ac}`.toLowerCase();
      const kick = new Date(baseKickoff.getTime() + slot * 3 * 3600 * 1000);
      slot += 1;

      await prisma.match.upsert({
        where: { id: mid },
        create: {
          id: mid,
          externalId: `wc26-m-${g}-${hc}-${ac}`,
          competitionId: opts.competitionId,
          tournamentId: opts.tournamentId,
          seasonId: opts.seasonId,
          homeTeamId: hid,
          awayTeamId: aid,
          kickoffTime: kick,
          status: MatchStatus.SCHEDULED,
          round: `小组赛 ${g} 组`,
          groupName: g,
          stage: 'GROUP',
          dataSource: DataSourceType.MANUAL,
          stadium: '待定',
          city: '待定',
          country: 'USA',
        },
        update: {
          competitionId: opts.competitionId,
          tournamentId: opts.tournamentId,
          seasonId: opts.seasonId,
          homeTeamId: hid,
          awayTeamId: aid,
          kickoffTime: kick,
          round: `小组赛 ${g} 组`,
          groupName: g,
          stage: 'GROUP',
        },
      });
      n += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(`WC2026 placeholder group matches upserted: ${n}`);
  return { matchesUpserted: n };
}
