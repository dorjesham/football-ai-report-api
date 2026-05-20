import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import express, { type Request, type Response, type NextFunction } from 'express';
import { join } from 'path';

/** C 端运维 API：不得走静态资源或 SPA index.html */
export function isAdminApiRequest(req: Request): boolean {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  return path.startsWith('/admin/api');
}

/**
 * React 管理端：仅托管 /admin 下非 API 路径。
 * 须在 `await app.init()` **之前** 调用：`/admin/api` 走 next() 进 Nest；`/admin/` 直接 index.html。
 */
export function mountAdminSpa(
  app: NestExpressApplication,
  adminSpaDir: string,
): void {
  const indexHtml = join(adminSpaDir, 'index.html');

  app.use(
    '/admin/assets',
    express.static(join(adminSpaDir, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }),
  );

  app.use('/admin', (req: Request, res: Response, next: NextFunction) => {
    if (isAdminApiRequest(req)) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const sub = (req.path || '').split('?')[0];
    if (sub.includes('.')) {
      return express.static(adminSpaDir, { index: false, maxAge: 0 })(
        req,
        res,
        next,
      );
    }
    return next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isAdminApiRequest(req)) return next();
    const path = (req.originalUrl || req.url || '').split('?')[0];
    if (!path.startsWith('/admin')) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (path.startsWith('/admin/assets/')) return next();

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(indexHtml, (err) => {
      if (err) next(err);
    });
  });

  Logger.log(`Admin SPA at /admin (${adminSpaDir})`, 'Bootstrap');
}
