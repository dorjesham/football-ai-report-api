import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express, { type Request, type Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { mountAdminSpa } from './config/mount-admin-spa';
import { resolveCorsOrigin } from './config/cors.util';
import { resolveListenPortNumber } from './config/listen-port.util';

// 最早一行 stdout：便于平台只采 stdout 时仍能看见进程已加载本文件
console.log(`[main] ${new Date().toISOString()} pid=${process.pid} cwd=${process.cwd()}`);

async function bootstrap() {
  console.log('[bootstrap] creating Nest application...');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('nodeEnv') || 'development';

  app.use(express.urlencoded({ extended: true }));
  app.enableCors({
    origin: resolveCorsOrigin(nodeEnv, config.get<string>('corsOrigin')),
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const adminSpaDir = join(__dirname, '..', 'admin-web', 'dist');
  const adminSpaEnabled = existsSync(adminSpaDir);
  if (adminSpaEnabled) {
    mountAdminSpa(app, adminSpaDir);
  } else {
    Logger.warn(
      `Admin SPA dist missing (${adminSpaDir}); run npm run build:admin`,
      'Bootstrap',
    );
  }

  const enableSwagger =
    nodeEnv !== 'production' || config.get<boolean>('enableSwaggerDocs') === true;
  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('football-ai-report-api')
      .setDescription('足球赛前 AI 情报报告 API')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
    app.getHttpAdapter().get('/', (_req: Request, res: Response) => {
      res.redirect(302, '/docs');
    });
  } else {
    app.getHttpAdapter().get('/', (_req: Request, res: Response) => {
      res.type('text/plain').send('football-ai-report-api');
    });
  }

  const port = resolveListenPortNumber();
  await app.init();
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `HTTP listening on 0.0.0.0:${port} (NODE_ENV=${nodeEnv}); align Ingress/Service targetPort with this port.`,
    'Bootstrap',
  );
}

bootstrap().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  console.error('[bootstrap] Nest application failed to start:\n', msg);
  process.exit(1);
});
