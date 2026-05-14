'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearAuth, getTenantSlug } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/calendar', label: 'Kalendář' },
  { href: '/customers', label: 'Zákazníci' },
  { href: '/branches', label: 'Pobočky' },
  { href: '/credit-packs', label: 'Permanentky' },
  { href: '/bundle-packs', label: 'Bundle' },
  { href: '/corporate-accounts', label: 'Firmy' },
  { href: '/payments', label: 'Platby' },
  { href: '/rules', label: 'Pravidla' },
  { href: '/blocks', label: 'Blokace' },
  { href: '/holidays', label: 'Svátky' },
  { href: '/settings', label: 'Nastavení' },
];

export function NavHeader() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    clearAuth();
    router.replace('/login');
  }

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <h1 className="text-lg font-bold">Reserved Admin</h1>
        <nav className="flex gap-1 text-sm">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded font-medium ${
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>salon: {getTenantSlug()}</span>
        <button onClick={handleLogout} className="hover:text-slate-900">
          Odhlásit
        </button>
      </div>
    </header>
  );
}
