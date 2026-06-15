import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { PwaRegister } from '@/components/PwaRegister';

export const metadata: Metadata = {
  title: 'Moje rezervace',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Rezervace' },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
