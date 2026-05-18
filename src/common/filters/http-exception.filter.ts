import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const obj = body as { message?: string | string[]; code?: string };
        if ('message' in obj) {
          const m = obj.message;
          message = Array.isArray(m) ? m.join(', ') : m || message;
        }
        if (typeof obj.code === 'string' && obj.code.trim()) {
          errorCode = obj.code.trim();
        } else {
          errorCode = exception.name;
        }
      } else {
        errorCode = exception.name;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    res.status(status).json({
      success: false,
      message,
      errorCode,
    });
  }
}
