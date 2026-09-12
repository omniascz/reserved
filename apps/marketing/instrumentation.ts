// Next.js instrumentation hook — volá se jednou na startu serveru.
// Pokud SENTRY_DSN není nastaven, Sentry se neaktivuje (no-op).
//
// Pro plnou client+server integraci by bylo potřeba withSentryConfig
// v next.config.mjs + sentry.client.config.ts. Pro v1 launch stačí
// server-side, který chytá errors v API routes, server components a edge.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge' && process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0,
    });
  }
}
