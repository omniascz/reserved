'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearAuth, getTenantSlug } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/calendar', label: 'Kalendář' },
  { href: '/customers', label: 'Zákazníci' },
  { href: '/branches', label: 'Pobočky' },
  { href: '/credit-packs', label: 'Permanentky' },
  { href: '/payments', label: 'Platby' },
  { href: '/rules', label: 'Pravidla' },
  { href: '/blocks', label: 'Blokace' },
  { href: '/holidays', label: 'Svátky' },
  { href: '/settings', label: 'Nastavení' },
];

export function NavHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Zavri menu pri zmene route
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function handleLogout() {
    clearAuth();
    router.replace('/login');
  }

  return (
    <header className="bg-white border-b border-slate-200 relative">
      {/* Top bar */}
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <h1 className="text-base sm:text-lg font-bold whitespace-nowrap">Reserved Admin</h1>
          {/* Desktop nav */}
          <nav className="hidden lg:flex gap-1 text-sm">
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
        <div className="flex items-center gap-2 sm:gap-3 text-sm text-slate-500">
          <span className="hidden sm:inline whitespace-nowrap">salon: {getTenantSlug()}</span>
          <button
            onClick={handleLogout}
            className="hidden sm:inline hover:text-slate-900 whitespace-nowrap"
          >
            Odhlásit
          </button>
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-label="Otevřít menu"
            className="lg:hidden p-2 -mr-2 text-slate-700"
          >
            {open ? (
              // X icon
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6L18 18M6 18L18 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              // Hamburger icon
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 7H20M4 12H20M4 17H20"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu drawer */}
      {open && (
        <nav className="lg:hidden border-t border-slate-200 bg-white">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 p-3 text-sm">
            {NAV.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded font-medium text-center ${
                    active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="border-t border-slate-200 p-3 flex justify-between items-center text-sm text-slate-500">
            <span>salon: {getTenantSlug()}</span>
            <button onClick={handleLogout} className="text-red-600 hover:text-red-800 font-medium">
              Odhlásit
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
