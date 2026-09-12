import { useTranslations, useMessages } from 'next-intl';
import { Link } from '@/i18n/navigation';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_BASE_URL ?? 'http://localhost:4002';

// Plán data — ceny a strukturální klíče zůstávají v kódu, popisky přicházejí
// z překladového souboru. Tím udržujeme ceny jako jedinou pravdu (kód) a
// texty jako překládatelné stringy.
interface PlanRow {
  key: 'free' | 'starter' | 'professional' | 'business';
  monthlyPriceKc: number;
  yearlyPriceKc: number;
  highlighted?: boolean;
  /** Klíče z `pricingPage.plans.<plan>.features`. Hodnota Value je suffix
   *  (např. "3" pro počet zaměstnanců); bool true → ✓; bool false → ×. */
  featureKeys: { key: string; valueKey?: string }[];
}

const PLANS: PlanRow[] = [
  {
    key: 'free',
    monthlyPriceKc: 0,
    yearlyPriceKc: 0,
    featureKeys: [
      { key: 'employees', valueKey: 'employeesValue' },
      { key: 'bookings', valueKey: 'bookingsValue' },
      { key: 'branches', valueKey: 'branchesValue' },
      { key: 'online' },
      { key: 'email' },
    ],
  },
  {
    key: 'starter',
    monthlyPriceKc: 590,
    yearlyPriceKc: 5900,
    featureKeys: [
      { key: 'employees', valueKey: 'employeesValue' },
      { key: 'bookings', valueKey: 'bookingsValue' },
      { key: 'branches', valueKey: 'branchesValue' },
      { key: 'online' },
      { key: 'email' },
      { key: 'sms' },
      { key: 'googleCal' },
    ],
  },
  {
    key: 'professional',
    monthlyPriceKc: 1290,
    yearlyPriceKc: 12900,
    highlighted: true,
    featureKeys: [
      { key: 'employees', valueKey: 'employeesValue' },
      { key: 'bookings', valueKey: 'bookingsValue' },
      { key: 'branches', valueKey: 'branchesValue' },
      { key: 'online' },
      { key: 'emailSms' },
      { key: 'googleCal' },
      { key: 'packages' },
      { key: 'b2b' },
      { key: 'api' },
    ],
  },
  {
    key: 'business',
    monthlyPriceKc: 2490,
    yearlyPriceKc: 24900,
    featureKeys: [
      { key: 'employees', valueKey: 'employeesValue' },
      { key: 'bookings', valueKey: 'bookingsValue' },
      { key: 'branches', valueKey: 'branchesValue' },
      { key: 'everything' },
      { key: 'whatsapp' },
      { key: 'ai' },
      { key: 'priority' },
    ],
  },
];

export default function PricingPage() {
  const t = useTranslations('pricingPage');
  // useMessages pro pole FAQ — t() nepodporuje array directly, dostáváme raw
  // messages a iterujeme.
  const messages = useMessages() as unknown as {
    pricingPage: { faq: { q: string; a: string }[] };
  };
  const faq = messages.pricingPage.faq;

  return (
    <>
      <section className="py-16 bg-gradient-to-br from-brand-50 to-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{t('title')}</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>
      </section>

      <section className="py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((plan) => (
              <div
                key={plan.key}
                className={`bg-white rounded-xl border-2 p-6 ${
                  plan.highlighted ? 'border-brand-600 shadow-xl' : 'border-slate-200'
                }`}
              >
                {plan.highlighted && (
                  <div className="text-xs font-semibold text-brand-700 mb-1">{t('popular')}</div>
                )}
                <h3 className="text-2xl font-bold mb-1">{t(`plans.${plan.key}.name`)}</h3>
                <p className="text-sm text-slate-500 mb-4">{t(`plans.${plan.key}.for`)}</p>
                <div className="mb-4">
                  {plan.monthlyPriceKc === 0 ? (
                    <span className="text-3xl font-bold">{t('free')}</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold">
                        {plan.monthlyPriceKc.toLocaleString('cs-CZ')}
                      </span>
                      <span className="text-sm text-slate-500"> {t('perMonth')}</span>
                      <div className="text-xs text-slate-500 mt-1">
                        {t('yearly', { amount: plan.yearlyPriceKc.toLocaleString('cs-CZ') })}
                      </div>
                    </>
                  )}
                </div>

                <ul className="space-y-2 text-sm mb-6">
                  {plan.featureKeys.map((f) => {
                    const label = t(`plans.${plan.key}.features.${f.key}`);
                    const value = f.valueKey ? t(`plans.${plan.key}.features.${f.valueKey}`) : null;
                    return (
                      <li key={f.key} className="flex items-start gap-2">
                        <span className="text-green-600">✓</span>
                        <span>
                          {label}
                          {value && <strong className="font-semibold"> · {value}</strong>}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <a
                  href={`${ADMIN_URL}/register`}
                  className={`block text-center font-semibold py-2.5 rounded-lg ${
                    plan.highlighted
                      ? 'bg-brand-600 hover:bg-brand-700 text-white'
                      : 'border border-slate-300 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {plan.monthlyPriceKc === 0 ? t('ctaRegister') : t('ctaTrial')}
                </a>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <p className="text-sm text-slate-500">
              {t('enterprise')}{' '}
              <a href="mailto:sales@reserved.cz" className="text-brand-700 hover:underline">
                sales@reserved.cz
              </a>
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-10">{t('faqTitle')}</h2>
          <div className="space-y-4">
            {faq.map((item) => (
              <details
                key={item.q}
                className="bg-white border border-slate-200 rounded-lg p-5 group"
              >
                <summary className="cursor-pointer font-semibold flex items-center justify-between">
                  {item.q}
                  <span className="text-slate-400 group-open:rotate-180 transition">▼</span>
                </summary>
                <p className="text-slate-600 text-sm mt-3 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">{t('ctaBigHeadline')}</h2>
          <p className="text-lg text-slate-600 mb-8">{t('ctaBigSub')}</p>
          <a
            href={`${ADMIN_URL}/register`}
            className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-4 rounded-lg text-lg"
          >
            {t('ctaBigButton')}
          </a>
        </div>
      </section>
    </>
  );
}
