import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DevAutoLogin } from '@/components/DevAutoLogin';

export const metadata: Metadata = {
  title: 'Reserved Master',
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
