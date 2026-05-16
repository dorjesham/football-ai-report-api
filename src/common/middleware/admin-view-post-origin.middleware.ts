import type { NextFunction, Request, Response } from 'express';

/**
 * 生产环境下限制 AdminView 写操作来源，降低跨站 POST 风险（非完整 CSRF token 方案）。
 * 浏览器同源表单会带 Origin 或 Referer；纯 curl 需加 `-H "Origin: https://你的域名"`。
 */
export function adminViewPostOriginMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== 'production') {
      return next();
    }
    if (req.method !== 'POST' || typeof req.path !== 'string') {
      return next();
    }
    if (!req.path.startsWith('/admin-view')) {
      return next();
    }
    if (
      req.path.endsWith('/password-login') ||
      req.path.endsWith('/session')
    ) {
      return next();
    }

    const host = req.headers.host;
    const origin = req.headers.origin;
    const referer = req.headers.referer;

    const sameHost = (urlStr: string): boolean => {
      try {
        const u = new URL(urlStr);
        return Boolean(host) && u.host === host;
      } catch {
        return false;
      }
    };

    if (origin) {
      if (!sameHost(origin)) {
        return res.status(403).type('text/plain').send('Forbidden: Origin');
      }
      return next();
    }
    if (referer) {
      if (!sameHost(referer)) {
        return res.status(403).type('text/plain').send('Forbidden: Referer');
      }
      return next();
    }
    return res.status(403).type('text/plain').send('Forbidden: missing Origin/Referer');
  };
}
