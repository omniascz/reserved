// API client pro tenant-site — používá public endpoints na Reserved API.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type SiteTemplate = 'elegant' | 'bold' | 'fresh';

export interface SiteContent {
  hero?: {
    headline?: string;
    subheadline?: string;
    coverPhotoUrl?: string;
    ctaText?: string;
  };
  about?: {
    headline?: string;
    text?: string;
    photoUrl?: string;
  };
  team?: {
    headline?: string;
    members?: Array<{ name: string; role?: string; photoUrl?: string; bio?: string }>;
  };
  gallery?: {
    headline?: string;
    photos?: string[];
  };
  testimonials?: {
    headline?: string;
    items?: Array<{ author: string; text: string }>;
  };
  faq?: {
    headline?: string;
    items?: Array<{ q: string; a: string }>;
  };
  contact?: {
    headline?: string;
    showAddress?: boolean;
    showHours?: boolean;
    showPhone?: boolean;
    phone?: string;
    email?: string;
    mapEmbedUrl?: string;
  };
  enabledSections?: string[];
}

export interface SiteData {
  tenant: {
    id: string;
    slug: string;
    name: string;
    businessType: string | null;
    customDomain: string | null;
    locale: string;
  };
  template: SiteTemplate;
  enabled: boolean;
  content: SiteContent;
  theme: {
    primaryColor?: string;
    borderRadius?: string;
    logoUrl?: string;
    fontFamily?: string;
    backgroundColor?: string;
    customCss?: string;
  };
  profile: {
    description: string | null;
    city: string | null;
    address: string | null;
    photos: string[];
    businessHours: Record<string, string>;
  };
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    priceHellers: number;
    currency: string;
    color: string | null;
  }>;
}

export async function fetchSite(slug: string): Promise<SiteData | null> {
  try {
    const res = await fetch(`${API_BASE}/public/${slug}/site`, {
      next: { revalidate: 60 }, // 1 min cache
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.data as SiteData;
  } catch {
    return null;
  }
}

/**
 * Najde tenant slug z Host headeru.
 * Hostname → tenant lookup pres API (vyhleda dle custom_domain).
 *
 * Pokud neni Host nakonfigurovany jako tenant custom_domain, vrati null.
 */
export async function findTenantByHost(host: string): Promise<{ slug: string } | null> {
  const cleanHost = host.split(':')[0]; // odstranit port
  if (!cleanHost) return null;
  try {
    const res = await fetch(`${API_BASE}/public/by-domain?host=${encodeURIComponent(cleanHost)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.data;
  } catch {
    return null;
  }
}
