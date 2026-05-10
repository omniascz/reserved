import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { AuthExceptionFilter } from './auth/auth-exception.filter.js';

async function bootstrap(): Promise<void> {
  // V dev módu povolíme volání z file:// (demo.html) a libovolného localhostu
  // i Vite dev serverů. V produkci se origin omezí na konkrétní APP_URL.
  const isDev = process.env.NODE_ENV !== 'production';
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: isDev
        ? true // odráží přijatý Origin (i `null` pro file://)
        : (process.env.APP_URL ?? 'https://reserved.cz'),
      credentials: true,
    },
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AuthExceptionFilter());

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Reserved API listening on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start API', err);
  process.exit(1);
});
