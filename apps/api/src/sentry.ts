// Sentry init — volá se PŘED NestFactory.create v main.ts.
//
// Pokud SENTRY_DSN není nastaven, init je no-op (Sentry SDK se chová tiše).
// To znamená, že v dev modu bez SENTRY_DSN se nic nestane — žádné requesty
// odesílané, žádné chyby v console.

import * as Sentry from '@sentry/node';

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
    // V produkci zachytáváme 100 % chyb; tracing je vzorkovaný (nákladově).
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    // Beforesend hook — sanitizuje citlivá data před odesláním.
    beforeSend(event) {
      // Odstraň query stringy s tokeny (např. ?token=...)
      if (event.request?.url) {
        event.request.url = event.request.url.replace(
          /([?&])(token|password|key)=[^&]+/gi,
          '$1$2=***',
        );
      }
      return event;
    },
  });
}

export { Sentry };
