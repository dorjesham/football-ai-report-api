/**
 * 输出 AF 日调用量估算与近 24h ApiLog 统计。
 * 用法: npm run ops:af-cost-report
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CI_THRESHOLDS, failThreshold } from './ci-strict.util';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const svc = app.get(
    (await import('../src/ops/api-football-cost-estimator.service'))
      .ApiFootballCostEstimatorService,
  );
  const out = await svc.estimateDaily();
  const estimatedDailyCalls = out.projectedDailyCalls?.total ?? 0;
  const maxDaily = CI_THRESHOLDS.afCostDailyMax();
  const payload = { ...out, estimatedDailyCalls, afCostDailyMax: maxDaily };
  console.log(JSON.stringify(payload, null, 2));
  await app.close();

  if (maxDaily != null && estimatedDailyCalls > maxDaily) {
    failThreshold(
      `AF projected daily calls ${estimatedDailyCalls} exceed AF_COST_DAILY_MAX ${maxDaily}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
