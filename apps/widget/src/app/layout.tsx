import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NAZEV_PRODUKTU } from '@/lib/znacka';

export const metadata: Metadata = {
  title: `Rezervace — ${NAZEV_PRODUKTU}`,
  description: 'Online rezervace termínu',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
