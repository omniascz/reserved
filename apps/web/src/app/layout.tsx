import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DevAutoLogin } from '@/components/DevAutoLogin';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';

export const metadata: Metadata = {
  title: 'Reserved Admin',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs">
      <body>
        <ImpersonationBanner />
        <DevAutoLogin>{children}</DevAutoLogin>
      </body>
    </html>
  );
}
