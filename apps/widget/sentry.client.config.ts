import * as Sentry from '@sentry/nextjs';

// Widget je embed do cizí stránky — error replay zde nemá moc smysl
// (nevidíme stránku zákazníka). Drží se na čistém error tracking.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0,
  });
}
