import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DevAutoLogin } from '@/components/DevAutoLogin';
import { NAZEV_PRODUKTU } from '@/lib/znacka';

export const metadata: Metadata = {
  title: `${NAZEV_PRODUKTU} Master`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs">
      <body>
        <DevAutoLogin>{children}</DevAutoLogin>
      </body>
    </html>
  );
}
