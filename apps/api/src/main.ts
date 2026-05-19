import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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
  const rawBodyCapture = (
    req: express.Request & { rawBody?: Buffer },
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    req.rawBody = req.body as Buffer;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).body = JSON.parse(req.rawBody.toString('utf8'));
    } catch {
      // Pokud neni JSON, nech original Buffer
    }
    next();
  };
  app.use('/api/v1/payments/webhooks', express.raw({ type: '*/*', limit: '1mb' }), rawBodyCapture);
  app.use('/api/v1/platform/webhooks', express.raw({ type: '*/*', limit: '1mb' }), rawBodyCapture);
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

  // ─── Swagger / OpenAPI ─────────────────────────────────────────────────
  // V dev modu je vystaveno na /api-docs (Swagger UI) a /api-docs-json (raw).
  // V produkci by se mohlo skrýt nebo přesunout za auth.
  if (isDev) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Reserved API')
      .setDescription(
        'Multi-tenant booking SaaS API. Tři autentizační režimy:\n' +
          '1. **JWT** (admin endpointy `/admin/*`, portal `/portal/*`, master `/platform/*`)\n' +
          '2. **API Key** (`/external/v1/*` — Bearer rsk_xxx)\n' +
          '3. **Anonymní** (`/public/:slug/*` — pro booking widget)',
      )
      .setVersion('1.0')
      .addServer(`http://localhost:${process.env.API_PORT ?? 4000}`)
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Admin JWT (z POST /auth/login) — pro `/admin/*` endpointy',
        },
        'jwt',
      )
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'rsk_*',
          description:
            'API klíč ve formátu `rsk_<32hex>` — pro `/external/v1/*` endpointy. ' +
            'Vygeneruj v admin studiu na stránce /api-keys.',
        },
        'api-key',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document, {
      jsonDocumentUrl: 'api-docs-json',
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Reserved API listening on http://localhost:${port}`);
  if (isDev) {
    // eslint-disable-next-line no-console
    console.log(`OpenAPI docs: http://localhost:${port}/api-docs`);
  }
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start API', err);
  process.exit(1);
});
