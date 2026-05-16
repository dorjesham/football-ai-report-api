/**
 * L1 E2E（Jest）：GET /health。需 DATABASE_URL；不进 L0 CI。
 * 运行: npm run test:e2e
 */
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';

describe('Health E2E', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.trim()) {
      console.warn('[e2e] skip: DATABASE_URL not set');
      return;
    }
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer();
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /health returns ok', async () => {
    if (!process.env.DATABASE_URL?.trim()) {
      return;
    }
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { status?: string };
    };
    const status = json.data?.status ?? (json as { status?: string }).status;
    expect(status).toBe('ok');
  });
});
