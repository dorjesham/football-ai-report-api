import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { isAdminApiRequest } from './mount-admin-spa';

/**
 * Nest 在 init 之后对未匹配路由直接 404；对 /admin 前端路由补发 index.html。
 */
@Catch(NotFoundException)
export class AdminSpaNotFoundFilter implements ExceptionFilter {
  private readonly indexHtml: string | null;

  constructor() {
    const dir = join(__dirname, '..', '..', 'admin-web', 'dist');
    const file = join(dir, 'index.html');
    this.indexHtml = existsSync(file) ? file : null;
  }

  catch(exception: NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<{ method?: string; originalUrl?: string; url?: string }>();
    const res = ctx.getResponse<Response>();

    if (
      this.indexHtml &&
      (req.method === 'GET' || req.method === 'HEAD') &&
      !isAdminApiRequest(req as never)
    ) {
      const path = (req.originalUrl || req.url || '').split('?')[0];
      if (path === '/admin' || path.startsWith('/admin/')) {
        if (path.startsWith('/admin/assets/')) {
          return this.jsonNotFound(res, exception);
        }
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.sendFile(this.indexHtml);
      }
    }

    return this.jsonNotFound(res, exception);
  }

  private jsonNotFound(res: Response, exception: NotFoundException) {
    const body = exception.getResponse();
    let message = 'Not Found';
    if (typeof body === 'string') {
      message = body;
    } else if (body && typeof body === 'object' && 'message' in body) {
      const m = (body as { message?: string | string[] }).message;
      message = Array.isArray(m) ? m.join(', ') : m || message;
    }
    res.status(404).json({
      success: false,
      message,
      errorCode: exception.name,
    });
  }
}
