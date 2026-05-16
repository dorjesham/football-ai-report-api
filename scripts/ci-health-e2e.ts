/**
 * L1 轻量 E2E：启动 Nest 后请求 GET /health（需 DATABASE_URL）。
 * 用法: npm run ci:health-e2e
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { exitNoData, failThreshold, isCiStrict } from './ci-strict.util';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer();
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const url = `http://127.0.0.1:${port}/health`;

  try {
    const res = await fetch(url);
    const body = await res.text();
    let json: { success?: boolean; data?: { status?: string } };
    try {
      json = JSON.parse(body) as typeof json;
    } catch {
      failThreshold(`health response not JSON: ${body.slice(0, 200)}`);
      if (isCiStrict()) process.exit(1);
      return;
    }
    const summary = {
      url,
      statusCode: res.status,
      ok: res.ok,
      dataStatus: json.data?.status,
    };
    console.log(JSON.stringify(summary, null, 2));

    if (!res.ok) {
      failThreshold(`GET /health HTTP ${res.status}`);
    }
    const status =
      json.data && typeof json.data === 'object' && 'status' in json.data
        ? (json.data as { status?: string }).status
        : (json as { status?: string }).status;
    if (status !== 'ok') {
      failThreshold(`health status expected ok, got ${status}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    exitNoData(`health e2e failed: ${msg}`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
