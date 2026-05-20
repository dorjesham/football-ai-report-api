import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/** 运维 JSON API 禁止 CDN/浏览器缓存，避免误 304 */
@Injectable()
export class AdminApiNoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      tap(() => {
        res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.removeHeader('etag');
        res.removeHeader('last-modified');
      }),
    );
  }
}
