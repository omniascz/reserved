import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Reserved — Moderní rezervační systém pro česká studia a kliniky',
  description:
    'Vlastníš svého klienta, žádné komise. Reserved je rezervační systém pro kadeřnictví, fyzioterapie, fitness centra, autoškoly a další. Vyzkoušej zdarma na 14 dní.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs">
      <body className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
