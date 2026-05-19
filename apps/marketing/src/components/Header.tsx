import Link from 'next/link';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_BASE_URL ?? 'http://localhost:4002';

const VERTICALS = [
  { slug: 'kadernictvi', label: 'Kadeřnictví' },
  { slug: 'fyzioterapie', label: 'Fyzioterapie' },
  { slug: 'fitness', label: 'Fitness' },
  { slug: 'lekarska-ordinace', label: 'Lékařská ordinace' },
  { slug: 'autoskola', label: 'Autoškola' },
];

export function Header() {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-brand-700">Reserved</span>
          <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded uppercase font-semibold tracking-wide">
            CZ
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <div className="relative group">
            <button className="text-slate-700 hover:text-brand-700 flex items-center gap-1">
              Pro váš obor
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            <div className="absolute top-full left-0 hidden group-hover:block bg-white border border-slate-200 rounded-lg shadow-lg py-2 min-w-[220px]">
              {VERTICALS.map((v) => (
                <Link
                  key={v.slug}
                  href={`/pro/${v.slug}`}
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {v.label}
                </Link>
              ))}
            </div>
          </div>
          <Link href="/funkce" className="text-slate-700 hover:text-brand-700">
            Funkce
          </Link>
          <Link href="/cenik" className="text-slate-700 hover:text-brand-700">
            Ceník
          </Link>
          <Link href="/o-nas" className="text-slate-700 hover:text-brand-700">
            O nás
          </Link>
          <Link href="/kontakt" className="text-slate-700 hover:text-brand-700">
            Kontakt
          </Link>
        </nav>

        <div className="flex items-center gap-3 text-sm">
          <a
            href={`${ADMIN_URL}/login`}
            className="text-slate-700 hover:text-brand-700 font-medium"
          >
            Přihlášení
          </a>
          <a
            href={`${ADMIN_URL}/register`}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            Začít zdarma
          </a>
        </div>
      </div>
    </header>
  );
}
