/**
 * 公开 C 端路由契约 smoke（无需登录）。
 * 用法: npm run ci:contract-routes
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { exitNoData, failThreshold } from './ci-strict.util';

const PUBLIC_GETS = [
  '/health',
  '/tournaments',
  '/competitions',
  '/matches',
  '/leagues/standings?codes=PL&season=2025&source=db',
  '/rankings/players?code=PL&season=2025&source=db&limit=5',
  '/orders/pricing',
  '/cms/tools',
  '/insights/upset-signals',
] as const;

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer();
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;
  const failures: string[] = [];

  for (const path of PUBLIC_GETS) {
    const url = `${base}${path}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        failures.push(`${path} HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { success?: boolean };
      if (json.success !== true) {
        failures.push(`${path} success!==true`);
      }
    } catch (e) {
      failures.push(`${path} ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(
    JSON.stringify(
      { checked: PUBLIC_GETS.length, failures },
      null,
      2,
    ),
  );
  await app.close();
  if (failures.length) {
    failThreshold(failures.join('; '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
