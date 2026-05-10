// Generický pipe, který validuje request body podle Zod schématu.
// Použití: @Body(new ZodValidationPipe(RegisterSchema)) body: RegisterDto

import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request body validation failed.',
          details: result.error.flatten(),
        },
      });
    }
    return result.data;
  }
}
