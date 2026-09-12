import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['cs', 'en'],
  defaultLocale: 'cs',
  // Pokud cesta nezacina locale prefixem, redirect na default
  localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];
