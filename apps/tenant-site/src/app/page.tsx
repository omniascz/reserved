// Tenant mini-site root.
//
// Routing logic:
//   - Host header určuje, který tenant.
//   - Pokud lokalita = preview mode (e.g. ?preview-slug=xyz), použij ten.
//   - Jinak: lookup byCustomDomain.
//
// Pokud tenant nemá zapnuto site_enabled, vrátíme 404 / instrukce.

import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { fetchSite, findTenantByHost, type SiteData } from '@/lib/api';
import { ElegantTemplate } from '@/components/templates/Elegant';

export const dynamic = 'force-dynamic';

async function loadSite(searchParams?: { 'preview-slug'?: string }): Promise<SiteData | null> {
  // Preview mode — admin posílá ?preview-slug=tvuj-slug (interní preview)
  const previewSlug = searchParams?.['preview-slug'];
  if (previewSlug) {
    return fetchSite(previewSlug);
  }

  const headersList = headers();
  const host = headersList.get('host') ?? '';
  const lookup = await findTenantByHost(host);
  if (!lookup) {
    return null;
  }
  return fetchSite(lookup.slug);
}

export default async function TenantSitePage({
  searchParams,
}: {
  searchParams: { 'preview-slug'?: string };
}) {
  const site = await loadSite(searchParams);

  if (!site) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md text-center space-y-4">
          <div className="text-5xl">🌐</div>
          <h1 className="text-2xl font-bold">Mini-web nenalezen</h1>
          <p className="text-slate-600 text-sm">
            Tato doména není zaregistrovaná v Reserved nebo tenant nemá aktivovaný mini-web.
          </p>
          <a
            href="https://reserved.cz"
            className="inline-block text-sm text-brand-600 hover:underline mt-4"
          >
            Reserved.cz — booking platforma →
          </a>
        </div>
      </div>
    );
  }

  // Pokud tenant nemá publikovaný mini-web, fallback na widget URL
  if (!site.enabled && !searchParams['preview-slug']) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold">{site.tenant.name}</h1>
          <p className="text-slate-600 text-sm">
            Mini-web je vypnutý. Pokračuj přímo na rezervaci:
          </p>
          <a
            href={`${process.env.NEXT_PUBLIC_WIDGET_URL ?? 'http://localhost:4004'}/${site.tenant.slug}`}
            className="inline-block px-6 py-3 bg-slate-900 text-white rounded-lg"
          >
            Rezervovat →
          </a>
        </div>
      </div>
    );
  }

  // Render šablony — zatím pouze Elegant; další budou bold a fresh.
  switch (site.template) {
    case 'elegant':
    case 'bold':
    case 'fresh':
    default:
      return <ElegantTemplate site={site} />;
  }
}

// Metadata pro SEO
export async function generateMetadata({
  searchParams,
}: {
  searchParams: { 'preview-slug'?: string };
}) {
  const site = await loadSite(searchParams);
  if (!site) {
    return { title: 'Reserved' };
  }
  const description =
    site.content.hero?.subheadline ??
    site.profile.description ??
    `Online rezervace pro ${site.tenant.name}`;
  return {
    title: site.tenant.name,
    description,
    openGraph: {
      title: site.tenant.name,
      description,
      images: site.content.hero?.coverPhotoUrl
        ? [{ url: site.content.hero.coverPhotoUrl }]
        : site.profile.photos.length > 0
          ? [{ url: site.profile.photos[0]! }]
          : [],
    },
  };
}
