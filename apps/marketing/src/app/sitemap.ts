// Dynamická sitemap pro marketing web (reserved.cz). Statické stránky + katalog
// tenantů z public API. Lokalizace: cs bez prefixu, en s /en (localePrefix as-needed).

import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://reserved.cz';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const STATIC_PATHS = ['', '/cenik', '/funkce', '/o-nas', '/kontakt', '/katalog'];
const VERTICALS = ['barber', 'fitness', 'ems', 'kurty', 'ordinace'];

interface CatalogListing {
  slug: string;
}

async function fetchCatalogSlugs(): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/public/catalog`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: CatalogListing[] };
    return (body.data ?? []).map((t) => t.slug).filter(Boolean);
  } catch {
    return [];
  }
}

/** cs = base + path; en = base + /en + path (as-needed prefix). */
function localized(path: string): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}${path}`, lastModified: new Date() },
    { url: `${SITE_URL}/en${path}`, lastModified: new Date() },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  for (const path of STATIC_PATHS) entries.push(...localized(path));
  for (const v of VERTICALS) entries.push(...localized(`/pro/${v}`));

  const slugs = await fetchCatalogSlugs();
  for (const slug of slugs) entries.push(...localized(`/katalog/${slug}`));

  return entries;
}
