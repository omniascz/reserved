'use client';

import Link from 'next/link';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { logout } from '@/lib/api';

export function PortalHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { tenant } = useParams<{ tenant: string }>();

  const nav = [
    { href: `/${tenant}/bookings`, label: 'Rezervace' },
    { href: `/${tenant}/credit-packs`, label: 'Permanentky' },
    { href: `/${tenant}/profile`, label: 'Profil' },
  ];

  async function handleLogout() {
    await logout();
    router.replace(`/${tenant}/login`);
  }

  return (
    <header className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 sm:gap-6 min-w-0 flex-1">
        <span className="font-bold text-base sm:text-lg whitespace-nowrap">Můj portál</span>
        <nav className="flex gap-0.5 sm:gap-1 text-xs sm:text-sm overflow-x-auto">
          {nav.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-2 sm:px-3 py-1.5 rounded font-medium whitespace-nowrap ${
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
      <button
        onClick={handleLogout}
        className="text-xs sm:text-sm text-slate-500 hover:text-slate-900 whitespace-nowrap"
      >
        Odhlásit
      </button>
    </header>
  );
}
