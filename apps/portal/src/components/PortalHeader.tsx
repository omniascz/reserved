'use client';

import Link from 'next/link';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { logout } from '@/lib/api';

export function PortalHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { tenant } = useParams<{ tenant: string }>();

  const nav = [
    { href: `/${tenant}/bookings`, label: 'Moje rezervace' },
    { href: `/${tenant}/credit-packs`, label: 'Permanentky' },
    { href: `/${tenant}/bundle-packs`, label: 'Bundle' },
    { href: `/${tenant}/time-packs`, label: 'Časové' },
    { href: `/${tenant}/profile`, label: 'Profil' },
  ];

  async function handleLogout() {
    await logout();
    router.replace(`/${tenant}/login`);
  }

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="font-bold text-lg">Moje rezervace</span>
        <nav className="flex gap-1 text-sm">
          {nav.map((item) => {
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
      <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-slate-900">
        Odhlásit
      </button>
    </header>
  );
}
