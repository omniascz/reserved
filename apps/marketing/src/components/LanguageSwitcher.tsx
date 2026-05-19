'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

const LABELS: Record<string, string> = {
  cs: '🇨🇿 CZ',
  en: '🇬🇧 EN',
};

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(newLocale: string) {
    router.replace(pathname, { locale: newLocale as 'cs' | 'en' });
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      {routing.locales.map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          className={`px-2 py-1 rounded font-medium ${
            l === locale ? 'bg-brand-100 text-brand-700' : 'text-slate-500 hover:bg-slate-100'
          }`}
          aria-label={`Switch to ${l}`}
        >
          {LABELS[l] ?? l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
