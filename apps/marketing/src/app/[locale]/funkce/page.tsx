import { useTranslations, useMessages } from 'next-intl';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_BASE_URL ?? 'http://localhost:4002';

const CATEGORY_KEYS = [
  'online',
  'crm',
  'packages',
  'payments',
  'notifications',
  'integrations',
  'rules',
  'reports',
  'security',
] as const;

export default function FeaturesPage() {
  const t = useTranslations('featuresPage');
  const messages = useMessages() as unknown as {
    featuresPage: {
      categories: Record<string, { title: string; items: string[] }>;
    };
  };

  return (
    <>
      <section className="py-16 bg-gradient-to-br from-brand-50 to-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{t('title')}</h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto">{t('subtitle')}</p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CATEGORY_KEYS.map((key) => {
            const cat = messages.featuresPage.categories[key];
            if (!cat) return null;
            return (
              <div key={key} className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-xl font-bold mb-4">{cat.title}</h2>
                <ul className="space-y-2 text-sm text-slate-700">
                  {cat.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="text-green-600 mt-0.5">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="py-20 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">{t('missingTitle')}</h2>
          <p className="text-lg text-slate-600 mb-6">{t('missingText')}</p>
          <a
            href="mailto:produkt@reserved.cz"
            className="text-brand-700 hover:text-brand-800 font-semibold"
          >
            produkt@reserved.cz →
          </a>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <a
            href={`${ADMIN_URL}/register`}
            className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-4 rounded-lg text-lg"
          >
            {t('ctaButton')}
          </a>
        </div>
      </section>
    </>
  );
}
