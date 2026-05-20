import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/** 为 legacy detail-v2 添加 Deprecation 与 Link 头 */
@Injectable()
export class DetailV2DeprecationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<{ setHeader?: (k: string, v: string) => void }>();
    const req = context.switchToHttp().getRequest<{ params?: { matchId?: string } }>();
    const matchId = req.params?.matchId;
    return next.handle().pipe(
      tap(() => {
        res.setHeader?.('Deprecation', 'true');
        if (matchId) {
          res.setHeader?.('Link', `</api/v2/matches/${matchId}/detail>; rel="successor-version"`);
        }
      }),
    );
  }
}
