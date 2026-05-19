import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match vse krome statickych assetu a Next interních cest
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
