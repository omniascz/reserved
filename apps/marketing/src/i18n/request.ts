import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

function isValidLocale(value: string | undefined): value is 'cs' | 'en' {
  return !!value && (routing.locales as readonly string[]).includes(value);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isValidLocale(requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
