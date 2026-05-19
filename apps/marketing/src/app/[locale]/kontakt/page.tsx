import { useTranslations } from 'next-intl';

const CARDS = [
  { key: 'support', icon: '💬', email: 'podpora@reserved.cz' },
  { key: 'sales', icon: '💼', email: 'sales@reserved.cz' },
  { key: 'partner', icon: '🤝', email: 'partner@reserved.cz' },
  { key: 'media', icon: '📰', email: 'media@reserved.cz' },
] as const;

export default function ContactPage() {
  const t = useTranslations('contactPage');

  return (
    <>
      <section className="py-20 bg-gradient-to-br from-brand-50 to-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{t('title')}</h1>
          <p className="text-lg text-slate-600">{t('subtitle')}</p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6 grid md:grid-cols-2 gap-6">
          {CARDS.map((card) => (
            <div key={card.key} className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="text-4xl mb-3">{card.icon}</div>
              <h3 className="font-bold text-lg mb-2">{t(`cards.${card.key}.title`)}</h3>
              <p className="text-sm text-slate-600 mb-3">{t(`cards.${card.key}.text`)}</p>
              <a
                href={`mailto:${card.email}`}
                className="text-brand-700 hover:underline font-medium text-sm"
              >
                {card.email} →
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold mb-6">{t('billingHeader')}</h2>
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm space-y-2">
            <div>
              <strong>{t('billing.company')}</strong>
            </div>
            <div>{t('billing.ico')}</div>
            <div>{t('billing.dic')}</div>
            <div>{t('billing.address')}</div>
            <div className="pt-2 text-slate-500">
              {t('billing.dataBox')} <span className="font-mono">abcd1234</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-4">{t('billingNote')}</p>
        </div>
      </section>
    </>
  );
}
