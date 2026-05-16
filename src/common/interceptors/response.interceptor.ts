import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';
import { SKIP_ENVELOPE_KEY } from '../decorators/skip-envelope.decorator';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const res = ctx.getResponse<Response>();

    const skip =
      this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true;

    return next.handle().pipe(
      map((data) => {
        if (skip || res.getHeader('X-Skip-Envelope')) {
          return data;
        }
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }
        return {
          success: true,
          data: data ?? null,
          message: 'ok',
        };
      }),
    );
  }
}
