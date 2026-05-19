import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale, getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { routing } from '@/i18n/routing';

function isValidLocale(value: string): value is 'cs' | 'en' {
  return (routing.locales as readonly string[]).includes(value);
}

export const metadata: Metadata = {
  title: {
    template: '%s | Reserved',
    default: 'Reserved — Moderní rezervační systém pro studia a kliniky',
  },
  description:
    'Vlastníš svého klienta, žádné komise. Reserved je rezervační systém pro kadeřnictví, fyzioterapie, fitness centra, autoškoly a další.',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="flex flex-col min-h-screen">
        <NextIntlClientProvider messages={messages}>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
