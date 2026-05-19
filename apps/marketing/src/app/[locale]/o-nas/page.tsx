import { useTranslations } from 'next-intl';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_BASE_URL ?? 'http://localhost:4002';

export default function AboutPage() {
  const t = useTranslations('aboutPage');

  return (
    <>
      <section className="py-20 bg-gradient-to-br from-brand-50 to-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{t('title')}</h1>
          <p className="text-lg text-slate-600">{t('subtitle')}</p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-3xl mx-auto px-6 prose prose-slate">
          <h2 className="text-2xl font-bold mb-4">{t('whyHeader')}</h2>
          <p className="text-slate-700 leading-relaxed mb-6">{t('whyP1')}</p>
          <p className="text-slate-700 leading-relaxed mb-6">{t('whyP2')}</p>

          <h2 className="text-2xl font-bold mb-4 mt-10">{t('valuesHeader')}</h2>
          <ul className="space-y-3 text-slate-700">
            <li>
              <strong>{t('values.v1Title')}</strong> {t('values.v1Text')}
            </li>
            <li>
              <strong>{t('values.v2Title')}</strong> {t('values.v2Text')}
            </li>
            <li>
              <strong>{t('values.v3Title')}</strong> {t('values.v3Text')}
            </li>
            <li>
              <strong>{t('values.v4Title')}</strong> {t('values.v4Text')}
            </li>
            <li>
              <strong>{t('values.v5Title')}</strong> {t('values.v5Text')}
            </li>
          </ul>

          <h2 className="text-2xl font-bold mb-4 mt-10">{t('whereHeader')}</h2>
          <p className="text-slate-700 leading-relaxed">
            {t('whereText')}{' '}
            <a href="mailto:ahoj@reserved.cz" className="text-brand-700 hover:underline">
              ahoj@reserved.cz
            </a>
            .
          </p>

          <div className="mt-10 not-prose">
            <a
              href={`${ADMIN_URL}/register`}
              className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg"
            >
              {t('ctaButton')}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
