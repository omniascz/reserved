import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_BASE_URL ?? 'http://localhost:4002';

export default function HomePage() {
  const t = useTranslations('home');
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-brand-50 py-20">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-block bg-brand-100 text-brand-700 text-sm font-semibold px-3 py-1 rounded-full mb-4">
              {t('madeIn')}
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              {t('h1Part1')} <span className="text-brand-700">{t('h1Part2')}</span>
            </h1>
            <p className="text-lg text-slate-600 mb-8 leading-relaxed">{t('subhead')}</p>
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <a
                href={`${ADMIN_URL}/register`}
                className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg text-center"
              >
                {t('ctaPrimary')}
              </a>
              <Link
                href="/cenik"
                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold px-6 py-3 rounded-lg text-center"
              >
                {t('ctaSecondary')}
              </Link>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <span className="text-green-600">✓</span> {t('trustTrial')}
              </span>
              <span className="flex items-center gap-1">
                <span className="text-green-600">✓</span> {t('trustNoCard')}
              </span>
              <span className="flex items-center gap-1">
                <span className="text-green-600">✓</span> {t('trustQuick')}
              </span>
            </div>
          </div>
          <div className="relative">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
                <div className="text-xs text-slate-400 ml-2">mujsalon.reserved.cz</div>
              </div>
              <MockCalendar />
            </div>
            <div className="absolute -top-4 -right-4 bg-green-100 border-2 border-green-300 rounded-lg px-3 py-2 shadow-lg rotate-3">
              <div className="text-xs text-green-800 font-semibold">+ Nová rezervace</div>
              <div className="text-xs text-green-700">Pavla · Střih · 14:00</div>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-12 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-sm text-slate-500 mb-6">
            Reserved používá více než 250 českých studií, klinik a fitness center
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-60">
            <span className="text-slate-400 font-semibold">Salon Petra</span>
            <span className="text-slate-400 font-semibold">FyzioCentrum Brno</span>
            <span className="text-slate-400 font-semibold">Fit Studio Praha</span>
            <span className="text-slate-400 font-semibold">Autoškola Novák</span>
            <span className="text-slate-400 font-semibold">JógaStudio Olomouc</span>
          </div>
        </div>
      </section>

      {/* Key features */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Vše, co salon potřebuje</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Od online rezervací přes klientskou databázi po platby a marketing. V jednom systému,
              plně česky.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon="📅"
              title="Online rezervace 24/7"
              text="Klienti si rezervují přes tvůj web nebo přímo na reserved.cz. Drag-and-drop kalendář s celodenním pohledem."
            />
            <FeatureCard
              icon="👥"
              title="CRM klientů"
              text="Historie návštěv, poznámky, tagy, no-show tracking. Vidíš, kdo je VIP a kdo má rád konkrétního zaměstnance."
            />
            <FeatureCard
              icon="💳"
              title="Platby kartou + QR"
              text="Hotovost, terminál, Stripe, GoPay nebo QR z účtu — všechny způsoby v jednom přehledu."
            />
            <FeatureCard
              icon="📲"
              title="Připomínky 24h předem"
              text="Automatický email i SMS klientovi den před rezervací. Snížíš no-show až o 60 %."
            />
            <FeatureCard
              icon="🎁"
              title="Permanentky a balíčky"
              text="10× vstup, kreditové permanentky, časová předplatná, firemní účty. Všechno se odečítá automaticky."
            />
            <FeatureCard
              icon="📊"
              title="Reporty a analytika"
              text="Tržby per zaměstnanec, top služby, vytíženost, no-show rate. Vidíš, co funguje a co ne."
            />
            <FeatureCard
              icon="🔗"
              title="Google Calendar sync"
              text="Obousměrně. Zaměstnanci vidí rezervace ve svém Googlu, blokace z Googlu se promítnou do dostupnosti."
            />
            <FeatureCard
              icon="⚡"
              title="Pravidla a automatizace"
              text="Vizuální builder: 'Když klient zmešká 2× → tag VIP_RISK + email majiteli'. Žádné kódování."
            />
            <FeatureCard
              icon="🔌"
              title="API + webhooky"
              text="Napoj Reserved na svůj e-shop, CRM nebo vlastní mobilní appku. Plně dokumentované API."
            />
          </div>
        </div>
      </section>

      {/* Why us — comparison */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Proč Reserved, a ne Booksy nebo Fresha?
            </h2>
            <p className="text-lg text-slate-600">
              Jsme férová alternativa. Klienti jsou tvoji, ne marketplace.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-6 py-4 font-semibold"></th>
                  <th className="text-center px-6 py-4 font-semibold text-brand-700">Reserved</th>
                  <th className="text-center px-6 py-4 font-semibold text-slate-500">Booksy</th>
                  <th className="text-center px-6 py-4 font-semibold text-slate-500">Fresha</th>
                </tr>
              </thead>
              <tbody>
                <ComparisonRow
                  label="Komise z rezervací"
                  reserved="0 %"
                  booksy="Někdy"
                  fresha="20 %"
                />
                <ComparisonRow
                  label="Klient je tvůj"
                  reserved="✓"
                  booksy="Sdílený"
                  fresha="Sdílený"
                />
                <ComparisonRow
                  label="ČR účetnictví (POHODA, Fakturoid)"
                  reserved="✓"
                  booksy="✗"
                  fresha="✗"
                />
                <ComparisonRow
                  label="Český support"
                  reserved="✓"
                  booksy="Omezený"
                  fresha="Email only"
                />
                <ComparisonRow label="QR platba SPD/IBAN" reserved="✓" booksy="✗" fresha="✗" />
                <ComparisonRow label="Firemní účty (B2B)" reserved="✓" booksy="✗" fresha="✗" />
                <ComparisonRow
                  label="API + Webhooky"
                  reserved="✓"
                  booksy="Omezené"
                  fresha="Omezené"
                />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing snippet */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Jednoduché ceny, bez překvapení</h2>
          <p className="text-lg text-slate-600 mb-10">
            Od 590 Kč měsíčně. 14 dní zdarma, můžeš kdykoliv přestat.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            <PricingCard
              name="Starter"
              price="590"
              for="Pro malé salony do 3 zaměstnanců"
              features={[
                'Až 3 zaměstnanci',
                '500 rezervací/měsíc',
                'SMS notifikace',
                'Google Calendar',
              ]}
            />
            <PricingCard
              name="Professional"
              price="1 290"
              for="Pro střední salony s 4-10 zaměstnanci"
              features={[
                'Až 10 zaměstnanců',
                '2 000 rezervací/měsíc',
                'Permanentky a balíčky',
                'Firemní účty',
                'API přístup',
              ]}
              highlighted
            />
            <PricingCard
              name="Business"
              price="2 490"
              for="Pro řetězce, neomezené rezervace, AI"
              features={[
                'Až 50 zaměstnanců',
                'Neomezené rezervace',
                'WhatsApp Business',
                'AI no-show prediction',
              ]}
            />
          </div>
          <div className="mt-10">
            <Link
              href="/cenik"
              className="inline-flex items-center gap-2 text-brand-700 hover:text-brand-800 font-semibold"
            >
              Detailní porovnání plánů →
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-brand-600 to-brand-800 text-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Začni přijímat rezervace ještě dnes
          </h2>
          <p className="text-lg text-brand-100 mb-8">
            Spuštění za 5 minut. Trial na 14 dní bez platební karty. Když se ti nebude líbit, prostě
            skončíš.
          </p>
          <a
            href={`${ADMIN_URL}/register`}
            className="inline-block bg-white text-brand-700 hover:bg-brand-50 font-semibold px-8 py-4 rounded-lg text-lg"
          >
            Vyzkoušet Reserved zdarma →
          </a>
        </div>
      </section>
    </>
  );
}

function FeatureCard({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{text}</p>
    </div>
  );
}

function ComparisonRow({
  label,
  reserved,
  booksy,
  fresha,
}: {
  label: string;
  reserved: string;
  booksy: string;
  fresha: string;
}) {
  return (
    <tr className="border-t border-slate-100">
      <td className="px-6 py-3 text-slate-700">{label}</td>
      <td className="px-6 py-3 text-center font-semibold text-brand-700">{reserved}</td>
      <td className="px-6 py-3 text-center text-slate-500">{booksy}</td>
      <td className="px-6 py-3 text-center text-slate-500">{fresha}</td>
    </tr>
  );
}

function PricingCard({
  name,
  price,
  for: forText,
  features,
  highlighted,
}: {
  name: string;
  price: string;
  for: string;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-xl border-2 p-6 text-left ${
        highlighted ? 'border-brand-600 shadow-lg scale-105' : 'border-slate-200'
      }`}
    >
      {highlighted && (
        <div className="text-xs font-semibold text-brand-700 mb-1">⭐ Nejoblíbenější</div>
      )}
      <h3 className="text-xl font-bold mb-1">{name}</h3>
      <p className="text-sm text-slate-500 mb-4">{forText}</p>
      <div className="mb-4">
        <span className="text-3xl font-bold">{price}</span>
        <span className="text-sm text-slate-500"> Kč/měsíc</span>
      </div>
      <ul className="space-y-1.5 text-sm text-slate-700">
        {features.map((f) => (
          <li key={f}>✓ {f}</li>
        ))}
      </ul>
    </div>
  );
}

function MockCalendar() {
  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3 text-sm">
        <span className="font-semibold">Pondělí 19. května</span>
        <div className="flex gap-1">
          <button className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs">
            ‹
          </button>
          <button className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs">
            ›
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <CalEvent time="9:00" name="Jana — Střih dámský" color="bg-blue-500" />
        <CalEvent time="10:30" name="Petra — Manikúra" color="bg-pink-500" />
        <CalEvent time="11:00" name="—" color="bg-slate-200" empty />
        <CalEvent time="12:00" name="Marie — Foukaná" color="bg-purple-500" />
        <CalEvent time="14:00" name="Eva — Střih + barvení" color="bg-green-500" />
        <CalEvent time="16:00" name="—" color="bg-slate-200" empty />
      </div>
    </div>
  );
}

function CalEvent({
  time,
  name,
  color,
  empty,
}: {
  time: string;
  name: string;
  color: string;
  empty?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-slate-500 w-12">{time}</span>
      <div className={`flex-1 ${color} ${empty ? '' : 'text-white'} px-2 py-1.5 rounded`}>
        {name}
      </div>
    </div>
  );
}
