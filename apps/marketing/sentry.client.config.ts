// Client-side Sentry init — běží v browseru, chytá React errors a unhandled
// promise rejections. Bundle se vytvoří jen pokud je tato app zabalená přes
// withSentryConfig (viz next.config.mjs).
//
// NEXT_PUBLIC_SENTRY_DSN je úmyslně public — Sentry DSN je bezpečné vystavit.

import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    // Session replay — natáčí kliky + screenshoty pro debug. Drahé, takže jen
    // u erroru.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    integrations: [Sentry.replayIntegration()],
  });
}
