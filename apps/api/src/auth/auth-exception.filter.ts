// Exception filter konvertující AuthError → HTTP odpověď.
// Bez něj NestJS vrátí 500 pro AuthError (extends Error, ne HttpException).

import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { AuthError } from './auth.errors.js';

@Catch(AuthError)
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: AuthError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    res.status(exception.httpStatus).json({
      error: {
        code: exception.code,
        message: exception.message,
      },
    });
  }
}
