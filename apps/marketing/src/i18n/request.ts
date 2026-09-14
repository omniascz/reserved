import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { dosadZnacku } from '@/lib/znacka';

function isValidLocale(value: string | undefined): value is 'cs' | 'en' {
  return !!value && (routing.locales as readonly string[]).includes(value);
}

/**
 * Dosadí značku do VŠECH textů hned při načtení překladů.
 *
 * TOHLE MÍSTO JE ZÁMĚRNÉ. V překladech se píše `{produkt}` a `{domena}`, jenže
 * pro next-intl je `{produkt}` parametr zprávy (ICU). Kdyby se dosazovalo až
 * u vykreslení, `t('klic')` spadne dřív, než se k textu kdokoli dostane:
 * `FORMATTING_ERROR: The intl string context variable "produkt" was not
 * provided` — a návštěvníkovi se místo textu ukáže název klíče, tedy doslova
 * `footer.copyright`. Ověřeno na běžícím serveru, ne odvozeno.
 *
 * Proto se dosazuje TADY, ještě než next-intl zprávu rozebere. Platí to pro
 * server (`t()`, `getMessages()`) i pro prohlížeč — přes
 * `NextIntlClientProvider` jdou tytéž zprávy, takže i `useMessages()` dostane
 * hotový text. Žádné volání tak nemůže na dosazení zapomenout.
 *
 * Pole se musí zachovat jako pole: časté dotazy v ceníku se přes ně mapují a
 * `Object.entries` by z nich udělalo objekt s číselnými klíči.
 */
function dosadDoVsech<T>(uzel: T): T {
  if (typeof uzel === 'string') return dosadZnacku(uzel) as T;
  if (Array.isArray(uzel)) return uzel.map(dosadDoVsech) as T;
  if (uzel !== null && typeof uzel === 'object') {
    const vysledek: Record<string, unknown> = {};
    for (const [klic, hodnota] of Object.entries(uzel)) {
      vysledek[klic] = dosadDoVsech(hodnota);
    }
    return vysledek as T;
  }
  return uzel;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isValidLocale(requested) ? requested : routing.defaultLocale;
  const surove = (await import(`../messages/${locale}.json`)).default;

  return {
    locale,
    messages: dosadDoVsech(surove),
  };
});
