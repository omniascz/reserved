import Link from 'next/link';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_BASE_URL ?? 'http://localhost:4002';

const CATEGORIES = [
  {
    title: '📅 Online rezervace',
    features: [
      'Rezervační widget 24/7 na tvém webu',
      'Drag-and-drop kalendář (denní / týdenní / měsíční)',
      'Více poboček, více zaměstnanců',
      'Skupinové lekce s kapacitou + waiting list',
      'Buffer time před/po rezervaci',
      'Hold slot na 10 minut během objednávání (anti-double-booking)',
    ],
  },
  {
    title: '👥 Klientský CRM',
    features: [
      'Karty klientů s celou historií',
      'Tagy a poznámky (s kategorií: medical, preferences, warning)',
      'No-show tracking + automatický blacklist po N opakování',
      'CSV import / export',
      'GDPR self-service (export osobních dat, právo být zapomenut)',
    ],
  },
  {
    title: '🎁 Balíčky a předplatné',
    features: [
      'Kreditové permanentky (10× vstup za 4 500 Kč)',
      'Bundle balíčky (3 služby najednou)',
      'Časová předplatná (neomezeno 30 dní)',
      'Měsíční členské plány s benefity',
      'Firemní účty (B2B) — firma kupuje, zaměstnanci čerpají',
    ],
  },
  {
    title: '💳 Platby',
    features: [
      'Hotovost + terminál (manuální záznam)',
      'Stripe online checkout',
      'GoPay pro CZ trh',
      'QR platba (SPD/IBAN) — generuje z účtu',
      'Záloha při rezervaci (deposit %)',
      'Refundy (manuální i automatické přes Stripe)',
    ],
  },
  {
    title: '📲 Notifikace',
    features: [
      'Email potvrzení, změna, zrušení',
      'SMS notifikace (přes BulkGate, ~1 Kč/SMS)',
      'Připomínka 24h předem (email + SMS)',
      'WhatsApp Business (Business plán)',
      'Push notifikace přes mobilní app (brzy)',
      'Daily digest pro majitele',
    ],
  },
  {
    title: '🔗 Integrace',
    features: [
      'Google Calendar — obousměrný sync per zaměstnance',
      'Outlook, Apple Calendar (přes iCal)',
      'Zapier / Make přes webhooky',
      'API + OpenAPI dokumentace na /api-docs',
      'Fakturoid (CZ účetní brzy)',
      'POHODA / Money S3 (na roadmapě)',
    ],
  },
  {
    title: '⚡ Pravidla a automatizace',
    features: [
      'Vizuální rule builder s drag-and-drop',
      'Event triggery: booking_created, cancelled, completed, no_show, customer_registered',
      '6 akcí: log, email, tag, webhook, charge_storno_fee, deduct_credit',
      'Storno + přesun pravidla (max dnů dopředu, min hodin předem)',
      'Per-day reschedule rules (z PO jen do PÁ)',
      'No-show fee — automatické strhnutí ze zálohy',
    ],
  },
  {
    title: '📊 Reporty',
    features: [
      'Dashboard s metrikami (rezervace, tržby, no-show rate)',
      'Top služby, zaměstnanci, klienti',
      'Vytíženost zaměstnanců (utilization)',
      'Comparison vs předchozí období',
      'Export do CSV (PDF/ISDOC brzy)',
      'Reporty per pobočka',
    ],
  },
  {
    title: '🛡️ Bezpečnost a GDPR',
    features: [
      'Multi-tenant izolace přes PostgreSQL RLS (bankovní úroveň)',
      'JWT autentizace + refresh token rotation',
      'API klíče pro programatický přístup (sandbox/production)',
      'Audit log všech akcí (kdo kdy co udělal)',
      'GDPR compliant — DPA na vyžádání',
      'Šifrované poznámky (RSA 4096 pro medical data)',
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <section className="py-16 bg-gradient-to-br from-brand-50 to-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Vše, co salon potřebuje</h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto">
            Reserved je komplexní provozní operační systém pro businessy s rezervacemi. Tady je
            kompletní inventář funkcí — nic skrytého za příplatkem, jen rozdělení do plánů.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CATEGORIES.map((cat) => (
            <div key={cat.title} className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-xl font-bold mb-4">{cat.title}</h2>
              <ul className="space-y-2 text-sm text-slate-700">
                {cat.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-green-600 mt-0.5">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="py-20 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">Něco chybí?</h2>
          <p className="text-lg text-slate-600 mb-6">
            Reserved se vyvíjí s našimi zákazníky. Pokud potřebuješ funkci, kterou tady nevidíš,
            napiš nám — pravděpodobně už ji někdo požaduje.
          </p>
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
            Vyzkoušet Reserved zdarma →
          </a>
        </div>
      </section>
    </>
  );
}
