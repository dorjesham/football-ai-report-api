/**
 * 同步五大联赛 + 欧战名单（头像、profile 快照）；需配置 API_FOOTBALL_API_KEY。
 *
 *   npx ts-node scripts/sync-league-squads.ts
 *   SEASON=2025 CODES=PL,PD,SA,BL1,FL1,CL,EL npx ts-node scripts/sync-league-squads.ts
 */
async function main() {
  const season = parseInt(process.env.SEASON || '2025', 10);
  const codes = (process.env.CODES || 'PL,PD,SA,BL1,FL1,CL,EL')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const delayMs = parseInt(process.env.DELAY_MS || '2000', 10);

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const ingest = app.get(
    (await import('../src/api-football/api-football-ingest.service')).ApiFootballIngestService,
  );

  const result = await ingest.syncSquads({
    competitionCodes: codes,
    season: Number.isFinite(season) ? season : 2025,
    delayBetweenRequestsMs: delayMs,
  });
  console.log(JSON.stringify(result, null, 2));
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
