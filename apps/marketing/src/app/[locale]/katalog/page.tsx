// Sprint 8.0-4: Marketplace v1 — public katalog tenantů.
//
// Server component, načítá data přímo z API (cache 5 min).

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

interface CatalogListing {
  id: string;
  slug: string;
  name: string;
  businessType: string | null;
  city: string | null;
  description: string | null;
  coverPhoto: string | null;
  servicesCount: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const WIDGET_URL = process.env.NEXT_PUBLIC_WIDGET_URL ?? 'http://localhost:4004';

async function fetchCatalog(
  city?: string,
  businessType?: string,
  search?: string,
): Promise<{ data: CatalogListing[]; total: number }> {
  const params = new URLSearchParams();
  if (city) params.set('city', city);
  if (businessType) params.set('businessType', businessType);
  if (search) params.set('search', search);
  try {
    const res = await fetch(`${API_URL}/public/catalog?${params}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return { data: [], total: 0 };
    }
    return res.json();
  } catch {
    return { data: [], total: 0 };
  }
}

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  hair_salon: '💇 Kadeřnictví',
  fitness: '💪 Fitness',
  physiotherapy: '🩺 Fyzioterapie',
  medical: '⚕️ Lékařská ordinace',
  driving_school: '🚗 Autoškola',
  other: '⚙️ Jiné',
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: { city?: string; type?: string; search?: string };
}) {
  const { city, type, search } = searchParams;
  const { data, total } = await fetchCatalog(city, type, search);
  const t = await getTranslations();

  return (
    <>
      <section className="py-12 bg-gradient-to-br from-brand-50 to-white">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl font-bold mb-2">Katalog studií a klinik</h1>
          <p className="text-slate-600 mb-6">
            Najdi salon, kliniku nebo fitko ve svém okolí a rezervuj online — bez komise.
          </p>

          {/* Filter form (GET) */}
          <form
            method="GET"
            className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl border border-slate-200"
          >
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Hledat podle jména…"
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="text"
              name="city"
              defaultValue={city}
              placeholder="Město (Praha, Brno…)"
              className="md:w-48 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <select
              name="type"
              defaultValue={type ?? ''}
              className="md:w-52 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Všechny obory</option>
              {Object.entries(BUSINESS_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2 rounded-lg"
            >
              Hledat
            </button>
          </form>
        </div>
      </section>

      <section className="py-10">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-sm text-slate-500 mb-4">
            {total === 0
              ? 'Žádný výsledek. Zkus jiný filtr.'
              : `${total} ${total === 1 ? 'salon' : total < 5 ? 'salony' : 'salonů'} v katalogu`}
          </p>

          {data.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="text-5xl mb-4">🔍</div>
              <p>Žádné výsledky podle zvolených kritérií.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.map((tenant) => (
                <Link
                  key={tenant.id}
                  href={`/katalog/${tenant.slug}`}
                  className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition group"
                >
                  {tenant.coverPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tenant.coverPhoto}
                      alt={tenant.name}
                      className="w-full h-44 object-cover bg-slate-100"
                    />
                  ) : (
                    <div className="w-full h-44 bg-gradient-to-br from-brand-100 to-brand-300 flex items-center justify-center text-5xl">
                      {tenant.businessType
                        ? BUSINESS_TYPE_LABELS[tenant.businessType]?.split(' ')[0]
                        : '🏪'}
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="font-bold text-lg group-hover:text-brand-700">{tenant.name}</h3>
                    {tenant.city && <p className="text-sm text-slate-500 mb-2">📍 {tenant.city}</p>}
                    {tenant.description && (
                      <p className="text-sm text-slate-600 line-clamp-2 mb-3">
                        {tenant.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      {tenant.businessType && (
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded">
                          {BUSINESS_TYPE_LABELS[tenant.businessType] ?? tenant.businessType}
                        </span>
                      )}
                      {tenant.servicesCount > 0 && (
                        <span className="text-slate-500">{tenant.servicesCount} služeb</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA pro tenanty */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold mb-3">Provozuješ salon nebo kliniku?</h2>
          <p className="text-slate-600 mb-6">
            Přidej se do katalogu zdarma a získej nové klienty. Bez komise z rezervací.
          </p>
          <Link
            href="/cenik"
            className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg"
          >
            Začít zdarma →
          </Link>
        </div>
      </section>
    </>
  );
}
