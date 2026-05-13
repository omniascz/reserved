import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from './app.module.js';
import { AuthExceptionFilter } from './auth/auth-exception.filter.js';

async function bootstrap(): Promise<void> {
  // V dev módu povolíme volání z file:// (demo.html) a libovolného localhostu
  // i Vite dev serverů. V produkci se origin omezí na konkrétní APP_URL.
  const isDev = process.env.NODE_ENV !== 'production';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      origin: isDev
        ? true // odráží přijatý Origin (i `null` pro file://)
        : (process.env.APP_URL ?? 'https://reserved.cz'),
      credentials: true,
    },
    bodyParser: false,
  });

  // Raw body capture pro webhook endpointy (Stripe potrebuje pro signature).
  // Pro non-webhook routes pouzijeme standardní JSON parser.
  app.use(
    '/api/v1/payments/webhooks',
    express.raw({ type: '*/*', limit: '1mb' }),
    (
      req: express.Request & { rawBody?: Buffer },
      _res: express.Response,
      next: express.NextFunction,
    ) => {
      // Ulozit raw + paralelně parsovat na JSON pro standardni @Body() decorator
      req.rawBody = req.body as Buffer;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).body = JSON.parse(req.rawBody.toString('utf8'));
      } catch {
        // Pokud neni JSON, nech original Buffer
      }
      next();
    },
  );
  // Standardni body parser pro vsechny ostatni routes
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

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
