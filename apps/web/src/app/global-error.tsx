'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <html lang="cs">
      <body>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Něco se pokazilo</h1>
          <p style={{ marginBottom: '2rem', color: '#666', maxWidth: '32rem' }}>
            Admin studio narazilo na chybu. Tým o ní byl informován. Zkuste obnovit stránku.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#000',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Zkusit znovu
          </button>
        </div>
      </body>
    </html>
  );
}
