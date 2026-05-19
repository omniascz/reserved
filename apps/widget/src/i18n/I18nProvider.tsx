'use client';

// Lehký i18n provider — bez next-intl. Widget potřebuje jen překlady, ne
// URL routing (URL slug určuje tenanta, ne jazyk; jazyk z query param).
//
// Použití:
//   <I18nProvider lang="en"><BookingFlow ... /></I18nProvider>
//   const t = useT();  // uvnitř komponenty
//   t('contact.title');
//   t('confirm.thanks', { tenant: 'Salon Petra' });

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { messages, type Lang, type MessageKey } from './messages';

const I18nContext = createContext<Lang>('cs');

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <I18nContext.Provider value={lang}>{children}</I18nContext.Provider>;
}

export function useLang(): Lang {
  return useContext(I18nContext);
}

export function useT(): (key: MessageKey, vars?: Record<string, string | number>) => string {
  const lang = useLang();
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>): string => {
      const raw: string = messages[lang][key] ?? messages.cs[key] ?? key;
      if (!vars) return raw;
      return Object.entries(vars).reduce<string>(
        (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
        raw,
      );
    },
    [lang],
  );
}
