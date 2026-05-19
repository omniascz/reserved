'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { logout, getMe, type MasterAdminMe } from '@/lib/api';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/tenants', label: 'Tenanti' },
  { href: '/audit', label: 'Audit' },
  { href: '/account', label: 'Účet' },
];

export function MasterNavHeader(): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MasterAdminMe | null>(null);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => undefined);
  }, []);

  async function handleLogout(): Promise<void> {
    await logout();
    router.replace('/login');
  }

  return (
    <header className="bg-brand-700 text-white border-b border-brand-800">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-bold text-lg tracking-tight">
            Reserved <span className="text-brand-200">Master</span>
          </Link>
          <nav className="flex gap-1">
            {NAV_ITEMS.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    active ? 'bg-brand-800 text-white' : 'text-brand-100 hover:bg-brand-800/60'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {me && (
            <span className="text-sm text-brand-100">
              {me.firstName} {me.lastName}
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm bg-brand-800 hover:bg-brand-900 px-3 py-1.5 rounded-md"
          >
            Odhlásit
          </button>
        </div>
      </div>
    </header>
  );
}
