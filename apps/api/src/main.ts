import 'reflect-metadata';
import { initSentry } from './sentry.js';

// Sentry musí být inicializován co nejdřív, aby zachytil i bootstrap chyby.
initSentry();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { AuthExceptionFilter } from './auth/auth-exception.filter.js';
import { PovoleneOriginyService } from './cors/povolene-originy.service.js';
import { SentryExceptionFilter } from './sentry.filter.js';

async function bootstrap(): Promise<void> {
  const isDev = process.env.NODE_ENV !== 'production';

  // POZOR: `cors: false` tu NEZNAMENÁ, že je CORS vypnutý. Znamená to, že se
  // nenastavuje TEĎ — zapne se hned po sestavení aplikace (viz níž). Důvod je
  // v tom, že seznam povolených adres potřebuje sáhnout do databáze kvůli
  // vlastním doménám zákazníků, a k té se dá dostat až přes hotovou aplikaci.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
    bodyParser: false,
  });

  // ─── Odkud smí prohlížeč volat API ──────────────────────────────────────
  // Ve vývoji je povoleno všechno (i `null` pro file://, kvůli demo.html).
  //
  // V produkci rozhoduje `PovoleneOriginyService`, který skládá dohromady:
  //   1. adresy aplikací z proměnných prostředí (administrace, portál, widget…),
  //   2. subdomény základní domény (subdomény tenantů),
  //   3. ruční doplnění v CORS_EXTRA_ORIGINS (pojistka),
  //   4. OVĚŘENÉ VLASTNÍ DOMÉNY zákazníků z databáze — ty se obnovují za běhu,
  //      takže nový zákazník nevyžaduje restart API.
  //
  // Dřív se povolovala jediná adresa (`APP_URL`) a nefungovaly čtyři aplikace
  // ze šesti; pak seznam z proměnných, který ale neuměl vlastní domény.
  const originy = app.get(PovoleneOriginyService);
  app.enableCors({
    origin: isDev
      ? true
      : (origin, callback): void => {
          // `false` znamená „hlavičku neposílej“ → prohlížeč volání zablokuje.
          // Není to chyba požadavku, proto se nevrací výjimka.
          callback(null, originy.jePovolena(origin));
        },
    credentials: true,
  });

  // ─── Bezpečnostní HTTP hlavičky (Helmet) ───────────────────────────────
  // POZOR na widget: vkládá se do cizích stránek jako <iframe> přes embed.js,
  // ale ten iframe míří na Next aplikaci (widget), NE na tohle API. API vrací
  // jen JSON a v iframe se nikdy nezobrazuje — hlavičky proti rámování ho tedy
  // rozbít nemůžou.
  //
  // Co widget rozbít MŮŽE a proto je vypnuté:
  //   - crossOriginResourcePolicy: JS uvnitř iframe volá tohle API z JINÉHO
  //     původu. Výchozí `same-origin` by všechna ta volání zablokoval, takže
  //     by na vložených widgetech přestaly fungovat rezervace.
  //   - contentSecurityPolicy: pro čisté JSON API nemá smysl a v dev režimu by
  //     rozbil Swagger UI na /api-docs (inline styly a skripty).
  //
  // CORS řeší povolené origins výš — Helmet ho nenahrazuje, doplňuje.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginEmbedderPolicy: false,
      // API se v prohlížeči nikdy nerámuje → zákaz rámování je bezpečný.
      frameguard: { action: 'deny' },
      // HSTS jen v produkci; v dev běží http://localhost a prohlížeč by si
      // vynucení HTTPS zapamatoval i pro další lokální projekty.
      hsts: isDev ? false : { maxAge: 15552000, includeSubDomains: true },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

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

  // Local uploads — image binary PUT, max 6 MB
  app.use(
    '/api/v1/admin/uploads/local',
    express.raw({ type: 'image/*', limit: '6mb' }),
    (
      req: express.Request & { rawBody?: Buffer },
      _res: express.Response,
      next: express.NextFunction,
    ) => {
      req.rawBody = req.body as Buffer;
      next();
    },
  );

  // Statické serving pro local uploads (dev mode fallback)
  const uploadsDir = process.env.UPLOADS_DIR ?? `${process.cwd()}/uploads`;
  app.use('/uploads', express.static(uploadsDir));

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
  // Pořadí filterů: SentryExceptionFilter je "catch-all" pro neočekávané chyby,
  // AuthExceptionFilter zachytává 401/403 → Sentry je nedostane (HttpException).
  app.useGlobalFilters(new SentryExceptionFilter(), new AuthExceptionFilter());

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
      .addServer(`http://localhost:${process.env.API_PORT ?? 4010}`)
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

  const port = Number(process.env.API_PORT ?? 4010);
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
