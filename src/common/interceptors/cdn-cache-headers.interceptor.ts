import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

function hasBearerAuth(req: Request): boolean {
  const h = req.headers.authorization;
  if (typeof h !== 'string') return false;
  return /^Bearer\s+\S+/i.test(h.trim());
}

/** GET /matches/:id/intel */
function isMatchIntelPath(path: string): boolean {
  return /^\/matches\/[^/]+\/intel$/i.test(path);
}

/** GET /matches/:id/analysis-preview */
function isMatchAnalysisPreviewPath(path: string): boolean {
  return /^\/matches\/[^/]+\/analysis-preview$/i.test(path);
}

function isMatchPhasePath(path: string): boolean {
  return /^\/matches\/[^/]+\/(pre-match|post-match|live)$/i.test(path);
}

/** GET /matches/:id（排除子路径） */
function isMatchDetailPath(path: string): boolean {
  return /^\/matches\/[^/]+$/i.test(path);
}

function isPublicCacheableGetPath(path: string): boolean {
  if (/^\/matches(\/|$)/i.test(path)) {
    if (path === '/matches') return true;
    if (
      isMatchIntelPath(path) ||
      isMatchDetailPath(path) ||
      isMatchAnalysisPreviewPath(path) ||
      isMatchPhasePath(path)
    ) {
      return true;
    }
    return false;
  }
  if (/^\/tournaments/i.test(path)) return true;
  if (/^\/competitions\/[^/]+\/standings$/i.test(path)) return true;
  if (/^\/rankings/i.test(path)) return true;
  if (/^\/insights/i.test(path)) return true;
  if (/^\/players\//i.test(path)) return true;
  if (/^\/cms/i.test(path)) return true;
  if (path === '/orders/pricing') return true;
  return false;
}

@Injectable()
export class CdnCacheHeadersInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    if (req.method !== 'GET') return next.handle();
    if (this.config.get<boolean>('cdnCacheHeadersEnabled') === false) {
      return next.handle();
    }
    const path = (req.path || req.url.split('?')[0] || '').split('?')[0];

    return next.handle().pipe(
      tap({
        next: () => {
          if (
            hasBearerAuth(req) &&
            (isMatchIntelPath(path) ||
              isMatchDetailPath(path) ||
              isMatchAnalysisPreviewPath(path) ||
              isMatchPhasePath(path))
          ) {
            res.setHeader('Cache-Control', 'private, no-store');
            res.setHeader('Vary', 'Authorization');
            return;
          }
          if (!isPublicCacheableGetPath(path)) return;
          const sMax = this.config.get<number>('httpCacheSMaxageSec') ?? 30;
          const swr =
            this.config.get<number>('httpCacheStaleWhileRevalidateSec') ?? 120;
          res.setHeader(
            'Cache-Control',
            `public, max-age=${sMax}, s-maxage=${sMax}, stale-while-revalidate=${swr}`,
          );
        },
      }),
    );
  }
}
