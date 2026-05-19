import Link from 'next/link';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_BASE_URL ?? 'http://localhost:4002';

interface PlanRow {
  key: string;
  name: string;
  for: string;
  monthlyPriceKc: number;
  yearlyPriceKc: number;
  highlighted?: boolean;
  features: { label: string; value: string | boolean }[];
}

const PLANS: PlanRow[] = [
  {
    key: 'free',
    name: 'Start',
    for: 'Pro vyzkoušení',
    monthlyPriceKc: 0,
    yearlyPriceKc: 0,
    features: [
      { label: 'Zaměstnanci', value: '1' },
      { label: 'Rezervace / měsíc', value: '50' },
      { label: 'Pobočky', value: '1' },
      { label: 'Online rezervace', value: true },
      { label: 'Email notifikace', value: true },
      { label: 'SMS notifikace', value: false },
      { label: 'Google Calendar', value: false },
      { label: 'Balíčky', value: false },
      { label: 'API přístup', value: false },
    ],
  },
  {
    key: 'starter',
    name: 'Starter',
    for: 'Pro malé salony',
    monthlyPriceKc: 590,
    yearlyPriceKc: 5900,
    features: [
      { label: 'Zaměstnanci', value: '3' },
      { label: 'Rezervace / měsíc', value: '500' },
      { label: 'Pobočky', value: '1' },
      { label: 'Online rezervace', value: true },
      { label: 'Email notifikace', value: true },
      { label: 'SMS notifikace', value: true },
      { label: 'Google Calendar', value: true },
      { label: 'Balíčky', value: false },
      { label: 'API přístup', value: false },
    ],
  },
  {
    key: 'professional',
    name: 'Professional',
    for: 'Pro střední salony',
    monthlyPriceKc: 1290,
    yearlyPriceKc: 12900,
    highlighted: true,
    features: [
      { label: 'Zaměstnanci', value: '10' },
      { label: 'Rezervace / měsíc', value: '2 000' },
      { label: 'Pobočky', value: '3' },
      { label: 'Online rezervace', value: true },
      { label: 'Email + SMS', value: true },
      { label: 'Google Calendar', value: true },
      { label: 'Balíčky a předplatné', value: true },
      { label: 'Firemní účty (B2B)', value: true },
      { label: 'API přístup', value: true },
    ],
  },
  {
    key: 'business',
    name: 'Business',
    for: 'Pro velké provozy a řetězce',
    monthlyPriceKc: 2490,
    yearlyPriceKc: 24900,
    features: [
      { label: 'Zaměstnanci', value: '50' },
      { label: 'Rezervace / měsíc', value: 'Neomezené' },
      { label: 'Pobočky', value: '20' },
      { label: 'Vše ze Starter + Pro', value: true },
      { label: 'WhatsApp Business', value: true },
      { label: 'AI no-show prediction', value: true },
      { label: 'Prioritní podpora', value: true },
    ],
  },
];

const FAQ = [
  {
    q: 'Můžu kdykoliv zrušit?',
    a: 'Ano. Předplatné běží měsíčně nebo ročně. Zrušení provedeš jedním klikem v admin sekci „Fakturace". Účet ti zůstane do konce předplaceného období.',
  },
  {
    q: 'Co když překročím limit rezervací nebo zaměstnanců?',
    a: 'Dáme ti vědět emailem a navrhneme upgrade. Žádné překvapivé poplatky — nikdy ti nestrhneme nic navíc bez tvého souhlasu.',
  },
  {
    q: 'Stojí SMS notifikace navíc?',
    a: 'Zahrnujeme 100 SMS / měsíc v plánech Starter a vyšších. Nad limit cca 1,50 Kč / SMS. Email je vždy zdarma.',
  },
  {
    q: 'Můžu používat vlastní doménu (např. rezervace.mujsalon.cz)?',
    a: 'Ano, v plánu Business a Enterprise. V plánech Starter / Pro dostáváš subdoménu (mujsalon.reserved.cz).',
  },
  {
    q: 'Berete komisi z rezervací?',
    a: 'Ne. Žádné poplatky z rezervací, žádný marketplace, žádný „nový klient fee". Platíš jen měsíční předplatné.',
  },
  {
    q: 'Co když mám zvláštní požadavky (vlastní integrace, SLA, SSO)?',
    a: 'Mrkni na Enterprise plán nebo nám napiš na sales@reserved.cz — uděláme ti nabídku na míru.',
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="py-16 bg-gradient-to-br from-brand-50 to-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Jednoduchý ceník</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Žádné komise. Žádné překvapení. Roční předplatné = 2 měsíce zdarma.
          </p>
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
                  <div className="text-xs font-semibold text-brand-700 mb-1">⭐ Nejoblíbenější</div>
                )}
                <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
                <p className="text-sm text-slate-500 mb-4">{plan.for}</p>
                <div className="mb-4">
                  {plan.monthlyPriceKc === 0 ? (
                    <span className="text-3xl font-bold">Zdarma</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold">
                        {plan.monthlyPriceKc.toLocaleString('cs-CZ')}
                      </span>
                      <span className="text-sm text-slate-500"> Kč/měsíc</span>
                      <div className="text-xs text-slate-500 mt-1">
                        Nebo {plan.yearlyPriceKc.toLocaleString('cs-CZ')} Kč/rok (2 měsíce zdarma)
                      </div>
                    </>
                  )}
                </div>

                <ul className="space-y-2 text-sm mb-6">
                  {plan.features.map((f) => (
                    <li
                      key={f.label}
                      className={`flex items-start gap-2 ${
                        f.value === false ? 'text-slate-400' : ''
                      }`}
                    >
                      <span className={f.value === false ? 'text-slate-300' : 'text-green-600'}>
                        {f.value === false ? '×' : '✓'}
                      </span>
                      <span>
                        {f.label}
                        {typeof f.value === 'string' && (
                          <strong className="font-semibold"> · {f.value}</strong>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>

                <a
                  href={`${ADMIN_URL}/register`}
                  className={`block text-center font-semibold py-2.5 rounded-lg ${
                    plan.highlighted
                      ? 'bg-brand-600 hover:bg-brand-700 text-white'
                      : 'border border-slate-300 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {plan.monthlyPriceKc === 0 ? 'Zaregistrovat' : 'Vyzkoušet zdarma'}
                </a>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <p className="text-sm text-slate-500">
              Potřebuješ víc (řetězec, vlastní doména, SSO, SLA)?{' '}
              <a href="mailto:sales@reserved.cz" className="text-brand-700 hover:underline">
                Napiš nám pro Enterprise nabídku.
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-10">Časté otázky</h2>
          <div className="space-y-4">
            {FAQ.map((item) => (
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

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">Vyzkoušej Reserved zdarma</h2>
          <p className="text-lg text-slate-600 mb-8">14 dní bez závazku, bez platební karty.</p>
          <a
            href={`${ADMIN_URL}/register`}
            className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-4 rounded-lg text-lg"
          >
            Začít zdarma →
          </a>
        </div>
      </section>
    </>
  );
}
