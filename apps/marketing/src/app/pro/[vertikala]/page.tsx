import { notFound } from 'next/navigation';
import Link from 'next/link';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_BASE_URL ?? 'http://localhost:4002';

interface VerticalContent {
  slug: string;
  industry: string;
  hero: {
    badge: string;
    headline: string;
    subhead: string;
  };
  painPoints: string[];
  features: { icon: string; title: string; text: string }[];
  testimonial: { name: string; salon: string; quote: string };
  faq: { q: string; a: string }[];
}

const CONTENT: Record<string, VerticalContent> = {
  kadernictvi: {
    slug: 'kadernictvi',
    industry: 'kadeřnictví a barber shopy',
    hero: {
      badge: '💇 Pro kadeřnictví a barber shopy',
      headline: 'Rezervační systém pro kadeřnictví, který klienti nemilují.',
      subhead:
        'Žádné poplatky z rezervací, žádné komise. Tvoje klientky zůstanou tvoje. Propojeno s Google Kalendářem, SMS notifikace, automatické připomínky.',
    },
    painPoints: [
      'Klienti zapomínají chodit — no-show ti bere 10-20 % tržeb',
      'Komplikované rezervace přes Instagram DM a telefon',
      'Booksy / Fresha si bere procento z každé rezervace',
      'Strávíš hodinu denně přeplánováním kalendáře',
    ],
    features: [
      {
        icon: '✂️',
        title: 'Šablony služeb pro kadeřnictví',
        text: 'Střih dámský / pánský, foukaná, barvení, melír — předkonfigurované od první minuty.',
      },
      {
        icon: '👨‍🦱',
        title: 'Více kadeřnic / barberů',
        text: 'Každý má vlastní rozvrh, klient si může vybrat oblíbenou kadeřnici nebo „kdokoliv volný".',
      },
      {
        icon: '🎟️',
        title: 'Permanentky a balíčky',
        text: '10× střih za 4 500 Kč. Klient platí předem, ty získáš jistotu cashflow.',
      },
      {
        icon: '📱',
        title: 'SMS připomínka 24h předem',
        text: 'Snížíš no-show o 60 %. Klient dostane upomínku den před návštěvou.',
      },
      {
        icon: '💳',
        title: 'Platby kartou na terminálu + QR',
        text: 'Hotovost, terminál, QR. Klient zaplatí jak chce, ty máš vše v jednom přehledu.',
      },
      {
        icon: '⭐',
        title: 'Tagy a poznámky o klientech',
        text: 'Alergie na barvu? Oblíbená délka? Vše v profilu klienta — připomenuto při příští návštěvě.',
      },
    ],
    testimonial: {
      name: 'Petra Nováková',
      salon: 'Salon Petra, Brno',
      quote:
        'Před Reserved jsem trávila hodinu denně přesouváním rezervací z papíru. Teď klienti rezervují sami online, dostávají SMS a já se můžu věnovat klientům. Tržby vzrostly o 30 %.',
    },
    faq: [
      {
        q: 'Kolik to stojí na 2 kadeřnice?',
        a: 'Plán Starter za 590 Kč/měsíc pokryje až 3 zaměstnance. Plán Professional (1 290 Kč) zahrnuje balíčky, předplatné a firemní účty.',
      },
      {
        q: 'Můžu přijímat platby kartou?',
        a: 'Ano. Reserved podporuje platby terminálem (manuální záznam), Stripe online, GoPay, QR platbu z účtu a hotovost.',
      },
      {
        q: 'Jak to funguje se zaměstnankyněmi?',
        a: 'Každá kadeřnice má vlastní účet, vlastní rozvrh a vidí jen své rezervace. Majitelka vidí přehled všech.',
      },
    ],
  },
  fyzioterapie: {
    slug: 'fyzioterapie',
    industry: 'fyzioterapeuty a kliniky',
    hero: {
      badge: '🏥 Pro fyzioterapie a kliniky',
      headline: 'Rezervační systém pro fyzioterapeuty a rehabilitační kliniky.',
      subhead:
        'Klienti rezervují online 24/7. Karty pacientů s historií, SOAP poznámky, GDPR compliant. Žádný papír, žádný chaos.',
    },
    painPoints: [
      'Papírové karty pacientů ztrácejí na hodnotě s každým ztraceným spisem',
      'Klienti nedorazí a tys čekal — 80 minut promarněných',
      'Komplikované plánování série terapií (10× za 3 měsíce)',
      'GDPR audit pro zdravotnická data je noční můra',
    ],
    features: [
      {
        icon: '📋',
        title: 'Karty pacientů s historií',
        text: 'Diagnóza, léčebný plán, SOAP poznámky (subjective, objective, assessment, plan). Vše šifrované.',
      },
      {
        icon: '🔁',
        title: 'Série rezervací',
        text: 'Permanentka „10× rehabilitace za 8 000 Kč" — klient si rezervuje postupně, kredity se odečítají.',
      },
      {
        icon: '🛡️',
        title: 'GDPR + zdravotnická data',
        text: 'Šifrované úložiště, audit log přístupů, smluvní zpracovatel (DPA), právo být zapomenut.',
      },
      {
        icon: '📅',
        title: 'Dlouhodobý plán léčby',
        text: 'Vytvoř klientovi celou sérii naráz — opakovaná rezervace každý týden po dobu 3 měsíců.',
      },
      {
        icon: '💉',
        title: 'Online schůzka přes Zoom/Meet',
        text: 'Pro konzultace na dálku — link na videohovor v emailu i v portálu pacienta.',
      },
      {
        icon: '📊',
        title: 'Reporty pro pojišťovny',
        text: 'Export tržeb a počtu sezení do PDF/Excelu. Snadné vyúčtování pro pojišťovny.',
      },
    ],
    testimonial: {
      name: 'MUDr. Tomáš Procházka',
      salon: 'FyzioCentrum Brno',
      quote:
        'Hledali jsme systém, který zvládne i SOAP poznámky a šifrování. Reserved nás přesvědčil — papírové karty jsme úplně odpárali a pacienti si rezervují sami.',
    },
    faq: [
      {
        q: 'Jak je to s GDPR?',
        a: 'Reserved je plně GDPR compliant — šifrované úložiště, audit log, klient může požádat o export či smazání. Pro zdravotnická data máme dodatečné šifrování (RSA 4096).',
      },
      {
        q: 'Můžu mít vícero terapeutů?',
        a: 'Ano. Každý má vlastní rozvrh, kapacitu a vlastní karty pacientů. Klient si může vybrat preferovaného terapeuta.',
      },
    ],
  },
  fitness: {
    slug: 'fitness',
    industry: 'fitness centra a personal trenéry',
    hero: {
      badge: '💪 Pro fitness centra a trenéry',
      headline: 'Rezervační systém pro fitness, personal training a skupinové lekce.',
      subhead:
        'Online rezervace lekcí, permanentky, časová předplatná (neomezeno 30 dní). Pro klienty, kteří chtějí flexibilitu.',
    },
    painPoints: [
      'Lekce máš vyprodaná, ale 3 lidé nedošli — ztracené kapacity',
      'Klienti chtějí flexibilní permanentky, ale počítáš to ručně',
      'Firemní benefity (Multisport, Benefity.cz) ti zabírají hodiny administrace',
      'Trenéři ti volají, kdy mají koho',
    ],
    features: [
      {
        icon: '🏋️',
        title: 'Skupinové lekce s kapacitou',
        text: 'Joga, crossfit, kruhový trénink — definuj kapacitu, klienti rezervují, automaticky waiting list.',
      },
      {
        icon: '🎫',
        title: 'Permanentky všech typů',
        text: '10× vstup, časové předplatné (neomezeno 30 dní), bundle (3 lekce + 1 PT) — všechny modely.',
      },
      {
        icon: '🏢',
        title: 'Firemní účty (B2B)',
        text: 'Pohodlná správa benefitů: firma kupuje vstupy, zaměstnanci je čerpají. Měsíční fakturace.',
      },
      {
        icon: '🧑‍🏫',
        title: 'Personal trenéři',
        text: 'Každý trenér má vlastní kalendář a klientelu. Klient si platí přímo PT nebo přes pakety.',
      },
      {
        icon: '⚡',
        title: 'No-show poplatky',
        text: 'Klient zruší pozdě? Automaticky strhne 50 % z permanentky. Pravidla nastavíš sám.',
      },
      {
        icon: '📲',
        title: 'Mobilní app pro klienty (brzy)',
        text: 'Klient vidí svůj rozvrh, rezervace a zbývající vstupy. Push notifikace na lekce.',
      },
    ],
    testimonial: {
      name: 'Marek Dvořák',
      salon: 'Fit Studio Praha',
      quote:
        'Permanentky byly v Excelu — peklo. Reserved nám automatizoval celý systém včetně B2B firemních účtů. Měsíčně ušetříme 20 hodin administrace.',
    },
    faq: [
      {
        q: 'Mám 50 firemních benefitů — zvládne to?',
        a: 'Ano, firemní účty jsou plně podporované v plánu Professional. Každá firma má vlastní balíček, zaměstnanci čerpají, ty fakturuješ firmě jednou měsíčně.',
      },
      {
        q: 'Jak funguje waiting list pro plné lekce?',
        a: 'Klient se zapíše na waiting list. Když někdo zruší, prvnímu na seznamu přijde email/SMS s 30 minutovým oknem na potvrzení.',
      },
    ],
  },
  'lekarska-ordinace': {
    slug: 'lekarska-ordinace',
    industry: 'lékařské ordinace',
    hero: {
      badge: '🩺 Pro lékařské ordinace',
      headline: 'Online objednávkový systém pro vaší ordinaci.',
      subhead:
        'Pacient si zarezervuje vyšetření online, dostane SMS připomínku a vy máte denní digest co vás čeká.',
    },
    painPoints: [
      'Sestra tráví celý den u telefonu objednáváním',
      'Pacienti nedorazí a vy máte „díru" v rozvrhu',
      'Papírové karty zabírají místo a ztrácí se',
      'Pojišťovna chce reporty o návštěvách, ručně je sestavujete týden',
    ],
    features: [
      {
        icon: '📞',
        title: 'Méně telefonování',
        text: 'Pacienti si rezervují přes web 24/7. Sestra se věnuje pacientům, ne telefonu.',
      },
      {
        icon: '📋',
        title: 'Karty pacientů',
        text: 'Vstupní formuláře (intake forms), historie návštěv, SOAP poznámky, alergie, předpisy.',
      },
      {
        icon: '🛡️',
        title: 'GDPR + zdravotní data',
        text: 'Šifrované úložiště, RSA 4096 pro citlivá pole. Audit log všech přístupů.',
      },
      {
        icon: '⏰',
        title: 'Připomínka 24h předem',
        text: 'SMS + email. Pacient ví, kdy má přijít. Méně no-show, vyšší obsazenost.',
      },
      {
        icon: '🔁',
        title: 'Pravidelné kontroly',
        text: 'Diabetik na kontrolu každé 3 měsíce? Vytvoř sérii rezervací jednou, systém je posílá automaticky.',
      },
      {
        icon: '📊',
        title: 'Reporty pro pojišťovny',
        text: 'Export do PDF/CSV pro VZP, OZP atd. Snadné vyúčtování.',
      },
    ],
    testimonial: {
      name: 'MUDr. Helena Černá',
      salon: 'Praktická lékařka, Liberec',
      quote:
        'Sestra mi šetří 2 hodiny denně. Pacienti si rezervují sami, dostávají SMS, my máme klid. Reserved navíc běží česky — žádný překlad „appointment" do „rezervace".',
    },
    faq: [
      {
        q: 'Jak je to s lékařskou dokumentací?',
        a: 'Reserved není elektronická zdravotní karta v právním smyslu (eRecept, EHR) — ale poznámky, intake forms a historii zvládá s šifrováním a auditem. Pro povinnou dokumentaci dál používej IZIP nebo Medibox.',
      },
      {
        q: 'Můžu nechat různé lékaře v jedné praxi?',
        a: 'Ano. Každý lékař má vlastní rozvrh a kapacitu. Pacient si vybere lékaře nebo „kdokoliv".',
      },
    ],
  },
  autoskola: {
    slug: 'autoskola',
    industry: 'autoškoly',
    hero: {
      badge: '🚗 Pro autoškoly',
      headline: 'Rezervační systém pro autoškoly — jízdy + teorie v jednom.',
      subhead:
        'Žáci si rezervují jízdy sami online. Učitelé vidí svůj rozvrh, vy máte přehled o celé autoškole.',
    },
    painPoints: [
      'Žáci tě otravují SMS — kdy mají jet, kde se sejdou',
      'Excel s rozvrhem se 30 učitelů a 200 žáky je tragédie',
      'Plánuješ teorii a jízdy zvlášť, vždycky to koliduje',
      'Žák platí permanentku 30 hodin, ty počítáš odjeté hodiny ručně',
    ],
    features: [
      {
        icon: '🚗',
        title: 'Jízdy + teorie společně',
        text: 'Jeden systém pro jízdy (1-1) i teorii (skupinová lekce s kapacitou).',
      },
      {
        icon: '🎫',
        title: 'Permanentky na hodiny jízd',
        text: 'Žák kupuje balíček 30 hodin jízd. Automaticky se odpočítává s každou jízdou.',
      },
      {
        icon: '👨‍🏫',
        title: 'Více učitelů',
        text: 'Každý učitel má vlastní rozvrh a auta. Žák si vybere preferovaného učitele.',
      },
      {
        icon: '📍',
        title: 'Místo srazu',
        text: 'V rezervaci je adresa srazu. Žák dostane email se Google Maps linkem.',
      },
      {
        icon: '📅',
        title: 'Termíny zkoušek',
        text: 'Naplánuj zkušební termíny, žáci se na ně přihlašují přes Reserved.',
      },
      {
        icon: '💳',
        title: 'Platby předem',
        text: 'Stripe / GoPay / QR. Žák zaplatí permanentku, vy máte cashflow předem.',
      },
    ],
    testimonial: {
      name: 'Pavel Novák',
      salon: 'Autoškola Novák, Plzeň',
      quote:
        'Měli jsme Excel s 200 žáky. Reserved nás zachránil — žáci si rezervují jízdy sami, učitelé mají přehled, peněženka mi přestala chybět permanentka.',
    },
    faq: [
      {
        q: 'Můžu mít auta jako zdroje?',
        a: 'V plánu Pro a vyšším ano — definuješ auta jako resources, žák při rezervaci jízdy vybere učitele i auto.',
      },
      {
        q: 'Jak to funguje s teorií?',
        a: 'Teorie = skupinová „služba" s kapacitou např. 15 míst. Žáci se přihlašují, ty vidíš obsazenost.',
      },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(CONTENT).map((slug) => ({ vertikala: slug }));
}

export default function VerticalLanding({ params }: { params: { vertikala: string } }) {
  const content = CONTENT[params.vertikala];
  if (!content) notFound();

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 via-white to-brand-50 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="inline-block bg-brand-100 text-brand-700 text-sm font-semibold px-3 py-1 rounded-full mb-4">
            {content.hero.badge}
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight max-w-4xl mb-6">
            {content.hero.headline}
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mb-8 leading-relaxed">
            {content.hero.subhead}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={`${ADMIN_URL}/register`}
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg text-center"
            >
              Vyzkoušet zdarma 14 dní
            </a>
            <Link
              href="/cenik"
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold px-6 py-3 rounded-lg text-center"
            >
              Zobrazit ceník
            </Link>
          </div>
        </div>
      </section>

      {/* Pain points */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold mb-10 text-center">
            Znáš to? Tak právě tohle řešíme.
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {content.painPoints.map((point) => (
              <div
                key={point}
                className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3"
              >
                <span className="text-red-600 text-xl">⚠️</span>
                <span className="text-slate-700">{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Funkce stavěné přesně pro {content.industry}
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Reserved není generický software. Šablony, scénáře a workflow jsou připraveny pro tvůj
              obor.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {content.features.map((f) => (
              <div key={f.title} className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="text-4xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <blockquote className="bg-brand-50 border-l-4 border-brand-600 p-8 rounded-r-xl">
            <p className="text-xl text-slate-800 italic leading-relaxed mb-4">
              „{content.testimonial.quote}"
            </p>
            <footer className="text-sm">
              <strong>{content.testimonial.name}</strong>
              <span className="text-slate-500"> · {content.testimonial.salon}</span>
            </footer>
          </blockquote>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-10">Časté otázky</h2>
          <div className="space-y-4">
            {content.faq.map((item) => (
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
      <section className="py-20 bg-gradient-to-r from-brand-600 to-brand-800 text-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Vyzkoušej Reserved pro tvé {content.industry}
          </h2>
          <p className="text-lg text-brand-100 mb-8">
            14 dní zdarma. Žádná karta. Pomůžeme s nastavením, pokud chceš.
          </p>
          <a
            href={`${ADMIN_URL}/register`}
            className="inline-block bg-white text-brand-700 hover:bg-brand-50 font-semibold px-8 py-4 rounded-lg text-lg"
          >
            Začít zdarma →
          </a>
        </div>
      </section>
    </>
  );
}
