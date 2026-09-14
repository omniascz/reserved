import type { MetadataRoute } from 'next';
import { WEB_ADRESA } from '@/lib/znacka';

// Viz sitemap.ts — výchozí adresa ze značky, ne natvrdo.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? WEB_ADRESA;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Admin/portál nejsou na téhle doméně, ale pro jistotu:
      disallow: ['/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
