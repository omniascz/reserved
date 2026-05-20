import Link from 'next/link';
import { notFound } from 'next/navigation';

interface CatalogProfile {
  id: string;
  slug: string;
  name: string;
  businessType: string | null;
  city: string | null;
  description: string | null;
  address: string | null;
  photos: string[];
  businessHours: Record<string, string>;
  coverPhoto: string | null;
  servicesCount: number;
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    priceHellers: number;
    currency: string;
  }>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const WIDGET_URL = process.env.NEXT_PUBLIC_WIDGET_URL ?? 'http://localhost:4004';

async function fetchProfile(slug: string): Promise<CatalogProfile | null> {
  try {
    const res = await fetch(`${API_URL}/public/catalog/${slug}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.data as CatalogProfile;
  } catch {
    return null;
  }
}

const DAY_LABELS: Record<string, string> = {
  mon: 'Pondělí',
  tue: 'Úterý',
  wed: 'Středa',
  thu: 'Čtvrtek',
  fri: 'Pátek',
  sat: 'Sobota',
  sun: 'Neděle',
};

function formatPrice(hellers: number, currency: string): string {
  const value = (hellers / 100).toLocaleString('cs-CZ');
  return `${value} ${currency === 'CZK' ? 'Kč' : currency}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export default async function CatalogProfilePage({ params }: { params: { slug: string } }) {
  const profile = await fetchProfile(params.slug);
  if (!profile) {
    notFound();
  }

  return (
    <>
      <section className="bg-slate-50 py-2 border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 text-sm">
          <Link href="/katalog" className="text-slate-500 hover:text-slate-900">
            ← Zpět do katalogu
          </Link>
        </div>
      </section>

      {/* Hero s fotkou + jméno */}
      {profile.coverPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.coverPhoto} alt={profile.name} className="w-full h-80 object-cover" />
      )}

      <section className="py-8">
        <div className="max-w-5xl mx-auto px-6">
          <h1 className="text-4xl font-bold mb-2">{profile.name}</h1>
          <div className="flex items-center gap-4 text-slate-600 mb-6">
            {profile.city && <span>📍 {profile.city}</span>}
            {profile.address && <span className="text-sm">· {profile.address}</span>}
          </div>

          {profile.description && (
            <div className="prose prose-slate max-w-none mb-8 text-slate-700 whitespace-pre-wrap">
              {profile.description}
            </div>
          )}

          <a
            href={`${WIDGET_URL}/${profile.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg mb-10"
          >
            Rezervovat online →
          </a>

          {/* Služby */}
          {profile.services.length > 0 && (
            <div className="mb-10">
              <h2 className="text-2xl font-bold mb-4">Nabízené služby</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {profile.services.map((s) => (
                  <div key={s.id} className="bg-white border border-slate-200 rounded-lg p-4">
                    <div className="font-semibold">{s.name}</div>
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-slate-500">{formatDuration(s.durationMinutes)}</span>
                      <span className="font-semibold">
                        {formatPrice(s.priceHellers, s.currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Otevírací hodiny */}
          {Object.keys(profile.businessHours).length > 0 && (
            <div className="mb-10">
              <h2 className="text-2xl font-bold mb-4">Otevírací hodiny</h2>
              <div className="bg-white border border-slate-200 rounded-lg p-4 max-w-md">
                <dl className="space-y-1 text-sm">
                  {Object.entries(DAY_LABELS).map(([key, label]) => (
                    <div key={key} className="flex justify-between">
                      <dt className="text-slate-600">{label}</dt>
                      <dd className="font-medium">{profile.businessHours[key] ?? 'Zavřeno'}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {/* Další fotky */}
          {profile.photos.length > 1 && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Galerie</h2>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                {profile.photos.slice(1).map((photo, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={photo}
                    alt={`${profile.name} foto ${i + 2}`}
                    className="w-full h-40 object-cover rounded-lg"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
