import Link from 'next/link';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_BASE_URL ?? 'http://localhost:4002';

export default function AboutPage() {
  return (
    <>
      <section className="py-20 bg-gradient-to-br from-brand-50 to-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Stavíme Reserved pro Česko</h1>
          <p className="text-lg text-slate-600">
            Software pro salony a kliniky, který je férový k provozovatelům i jejich klientům.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-3xl mx-auto px-6 prose prose-slate">
          <h2 className="text-2xl font-bold mb-4">Proč jsme začali</h2>
          <p className="text-slate-700 leading-relaxed mb-6">
            Sledovali jsme, jak české salony platí 20 % komise zahraničním marketplacům za
            „akvizici" klientů, kteří už by k nim přišli i tak. Stávající systémy byly buď
            staromódní (Reservanto, Reservio), nebo příliš drahé pro malé provozovatele (SimplyBook,
            Calendly).
          </p>
          <p className="text-slate-700 leading-relaxed mb-6">
            Rozhodli jsme se postavit moderní rezervační systém pro český a evropský trh — férový k
            provozovatelům (žádné komise z rezervací), integrovaný s českým ekosystémem (POHODA,
            Fakturoid, GoPay, QR platby) a s důrazem na moderní UX.
          </p>

          <h2 className="text-2xl font-bold mb-4 mt-10">Co je pro nás důležité</h2>
          <ul className="space-y-3 text-slate-700">
            <li>
              <strong>Klient je tvůj.</strong> Žádný marketplace, žádná komise. Když si klient tebe
              vybere, nikdo do toho mezi vás nevstoupí.
            </li>
            <li>
              <strong>Žádné překvapení v ceně.</strong> Pevné měsíční předplatné. Žádné skryté
              poplatky, žádné Custom Features za příplatek.
            </li>
            <li>
              <strong>Plně česky.</strong> Včetně podpory, dokumentace, právních dokumentů a
              integrací s českým účetnictvím.
            </li>
            <li>
              <strong>Otevřené API.</strong> Pokud si chceš napsat vlastní integraci nebo mobilní
              appku, máš k tomu plnou dokumentaci.
            </li>
            <li>
              <strong>Soukromí klientů.</strong> Bankovní úroveň izolace dat (PostgreSQL RLS), GDPR
              compliant, šifrování citlivých polí.
            </li>
          </ul>

          <h2 className="text-2xl font-bold mb-4 mt-10">Kde nás najdeš</h2>
          <p className="text-slate-700 leading-relaxed">
            Sídlíme v Praze. Pracujeme distribuovaně, ale podpora odpovídá v české pracovní době.
            Kontakt:{' '}
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
              Vyzkoušet Reserved →
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
