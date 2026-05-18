/**
 * 一次性清理生产/联调库中的曼城 vs 阿森纳演示场 `seed-match-admin-showcase`。
 * 可重复执行；无该场次时仅输出 skipped。
 *
 *   npx ts-node scripts/cleanup-admin-showcase-match.ts
 */
import { PrismaClient } from '@prisma/client';

const MATCH_ID = 'seed-match-admin-showcase';
const SHOWCASE_REFEREE_ID = 'seed-referee-showcase';

const prisma = new PrismaClient();

async function deleteMatchAndOrders(matchId: string) {
  const unlocks = await prisma.paymentUnlock.deleteMany({ where: { matchId } });
  const orders = await prisma.order.deleteMany({ where: { matchId } });
  const match = await prisma.match.deleteMany({ where: { id: matchId } });
  return { unlocks: unlocks.count, orders: orders.count, matches: match.count };
}

async function maybeDeleteOrphanReferee() {
  const stillUsed = await prisma.refereeSnapshot.count({
    where: { refereeId: SHOWCASE_REFEREE_ID },
  });
  if (stillUsed > 0) return { refereeDeleted: 0 };
  const r = await prisma.referee.deleteMany({ where: { id: SHOWCASE_REFEREE_ID } });
  return { refereeDeleted: r.count };
}

async function main() {
  const exists = await prisma.match.findUnique({
    where: { id: MATCH_ID },
    select: { id: true },
  });
  if (!exists) {
    console.log(JSON.stringify({ matchId: MATCH_ID, skipped: true, reason: 'not_found' }));
    await maybeDeleteOrphanReferee();
    return;
  }

  const result = await deleteMatchAndOrders(MATCH_ID);
  const referee = await maybeDeleteOrphanReferee();
  console.log(JSON.stringify({ matchId: MATCH_ID, ...result, ...referee }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
