import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class DetailV2MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ route?: { path?: string }; url?: string }>();
    const route =
      req.route?.path ??
      (req.url?.includes('/api/v2/') ? 'api_v2_detail' : 'detail_v2_legacy');
    const t0 = process.hrtime.bigint();
    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Number(process.hrtime.bigint() - t0) / 1e9;
          this.metrics.observeDetailDuration(route, ms);
        },
        error: () => {
          const ms = Number(process.hrtime.bigint() - t0) / 1e9;
          this.metrics.observeDetailDuration(route, ms);
        },
      }),
    );
  }
}
