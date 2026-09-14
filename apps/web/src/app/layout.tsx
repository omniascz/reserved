import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DevAutoLogin } from '@/components/DevAutoLogin';
import { EmailVerificationBanner } from '@/components/EmailVerificationBanner';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { NAZEV_PRODUKTU } from '@/lib/znacka';

export const metadata: Metadata = {
  title: `${NAZEV_PRODUKTU} Admin`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs">
      <body>
        <ImpersonationBanner />
        {/* Pruh pro nepotvrzený e-mail — v layoutu, aby byl vidět všude.
            Sám se skryje, když uživatel není přihlášený nebo je adresa ověřená. */}
        <EmailVerificationBanner />
        <DevAutoLogin>{children}</DevAutoLogin>
      </body>
    </html>
  );
}
