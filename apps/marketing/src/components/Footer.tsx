import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300 mt-24">
      <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
        <div>
          <div className="text-2xl font-bold text-white mb-3">Reserved</div>
          <p className="text-sm text-slate-400">
            Moderní rezervační systém pro česká studia, kliniky a sportovní centra.
          </p>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-3">Produkt</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/funkce" className="hover:text-white">
                Funkce
              </Link>
            </li>
            <li>
              <Link href="/cenik" className="hover:text-white">
                Ceník
              </Link>
            </li>
            <li>
              <a href="http://localhost:4000/api-docs" className="hover:text-white">
                API dokumentace
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-3">Pro váš obor</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/pro/kadernictvi" className="hover:text-white">
                Kadeřnictví
              </Link>
            </li>
            <li>
              <Link href="/pro/fyzioterapie" className="hover:text-white">
                Fyzioterapie
              </Link>
            </li>
            <li>
              <Link href="/pro/fitness" className="hover:text-white">
                Fitness
              </Link>
            </li>
            <li>
              <Link href="/pro/lekarska-ordinace" className="hover:text-white">
                Lékařská ordinace
              </Link>
            </li>
            <li>
              <Link href="/pro/autoskola" className="hover:text-white">
                Autoškola
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-3">Firma</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/o-nas" className="hover:text-white">
                O nás
              </Link>
            </li>
            <li>
              <Link href="/kontakt" className="hover:text-white">
                Kontakt
              </Link>
            </li>
            <li>
              <a href="mailto:podpora@reserved.cz" className="hover:text-white">
                Podpora
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-slate-500">
          <div>© 2026 Reserved. Vytvořeno s ❤️ v České republice.</div>
          <div className="flex gap-4">
            <Link href="/pravni/obchodni-podminky" className="hover:text-white">
              Obchodní podmínky
            </Link>
            <Link href="/pravni/gdpr" className="hover:text-white">
              Ochrana osobních údajů
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
