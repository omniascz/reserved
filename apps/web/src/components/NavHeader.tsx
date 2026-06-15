'use client';

// Sprint 9.1-A: Reorganizovaná navigace do 6 logických skupin.
// Místo 21 plochých položek → dropdown menus.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { clearAuth, getTenantSlug } from '@/lib/api';

interface NavItem {
  href: string;
  label: string;
  description?: string;
  badge?: 'new' | 'dev';
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    key: 'operations',
    label: 'Provoz',
    items: [
      { href: '/calendar', label: 'Kalendář', description: 'Drag-and-drop kalendář rezervací' },
      { href: '/customers', label: 'Zákazníci', description: 'CRM, historie, tagy, no-show risk' },
      { href: '/payments', label: 'Platby', description: 'Hotovost, terminál, Stripe, QR' },
    ],
  },
  {
    key: 'catalog',
    label: 'Nabídka',
    items: [
      { href: '/services', label: 'Služby', description: 'Cenník služeb' },
      { href: '/credit-packs', label: 'Permanentky', description: '10× vstup' },
      { href: '/bundle-packs', label: 'Bundle', description: 'Více služeb v balíčku' },
      { href: '/time-packs', label: 'Časové', description: 'Neomezeno na X dní' },
      { href: '/subscription-plans', label: 'Předplatné', description: 'Měsíční členské plány' },
      { href: '/corporate-accounts', label: 'Firmy', description: 'B2B účty' },
    ],
  },
  {
    key: 'team',
    label: 'Tým',
    items: [
      { href: '/employees', label: 'Zaměstnanci', description: 'Tým, pracovní doba' },
      { href: '/branches', label: 'Pobočky', description: 'Více provozoven' },
      { href: '/blocks', label: 'Blokace', description: 'Dovolené, neplánované odstávky' },
      { href: '/holidays', label: 'Svátky', description: 'Státní svátky a custom' },
      { href: '/rules', label: 'Pravidla', description: 'Storno, no-show fee, automatizace' },
    ],
  },
  {
    key: 'web',
    label: 'Web & Widget',
    items: [
      { href: '/settings/theme', label: 'Vzhled', description: 'Barva, font, logo', badge: 'new' },
      {
        href: '/settings/embed',
        label: 'Embed kód',
        description: 'Vlož widget na svůj web',
        badge: 'new',
      },
      {
        href: '/settings/site',
        label: 'Mini-web',
        description: 'Vlastní web s rezervací',
        badge: 'new',
      },
      {
        href: '/settings/domain',
        label: 'Vlastní doména',
        description: 'booking.svujsalon.cz',
        badge: 'new',
      },
      {
        href: '/settings/catalog',
        label: 'Katalog Reserved',
        description: 'Profil v reserved.cz/katalog',
        badge: 'new',
      },
    ],
  },
  {
    key: 'integrations',
    label: 'Integrace',
    items: [
      { href: '/integrations', label: 'Integrace', description: 'Google Calendar, Fakturoid, …' },
      { href: '/webhooks', label: 'Webhooky', description: 'Zapier, Make, custom', badge: 'dev' },
      { href: '/api-keys', label: 'API klíče', description: 'Programatický přístup', badge: 'dev' },
      {
        href: '/feature-flags',
        label: 'Feature flags',
        description: 'Experimentální funkce',
        badge: 'dev',
      },
    ],
  },
  {
    key: 'account',
    label: 'Účet',
    items: [
      { href: '/settings', label: 'Nastavení', description: 'Rezervační pravidla, notifikace' },
      { href: '/billing', label: 'Fakturace', description: 'Plán, faktury, platební karta' },
    ],
  },
];

export function NavHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    setOpenGroup(null);
  }, [pathname]);

  function handleLogout(): void {
    clearAuth();
    router.replace('/login');
  }

  function isGroupActive(group: NavGroup): boolean {
    return group.items.some((item) => pathname?.startsWith(item.href));
  }

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="px-6 py-3 flex items-center justify-between" ref={containerRef}>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-bold hover:text-brand-700">
            Reserved
          </Link>

          <nav className="flex gap-1 text-sm">
            <Link
              href="/dashboard"
              className={`px-3 py-1.5 rounded font-medium ${
                pathname === '/dashboard'
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Dashboard
            </Link>

            <Link
              href="/reports"
              className={`px-3 py-1.5 rounded font-medium ${
                pathname === '/reports'
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Reporty
            </Link>

            {GROUPS.map((group) => {
              const active = isGroupActive(group);
              const isOpen = openGroup === group.key;
              return (
                <div key={group.key} className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenGroup(isOpen ? null : group.key)}
                    className={`px-3 py-1.5 rounded font-medium flex items-center gap-1 ${
                      active || isOpen
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {group.label}
                    <span className={`text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                      ▾
                    </span>
                  </button>

                  {isOpen && (
                    <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-40">
                      {group.items.map((item) => {
                        const isActiveItem = pathname?.startsWith(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`block px-4 py-2.5 hover:bg-slate-50 ${
                              isActiveItem ? 'bg-brand-50' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`font-medium ${isActiveItem ? 'text-brand-700' : 'text-slate-900'}`}
                              >
                                {item.label}
                              </span>
                              {item.badge === 'new' && (
                                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold uppercase">
                                  Nové
                                </span>
                              )}
                              {item.badge === 'dev' && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold uppercase">
                                  Dev
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="hidden md:inline">salon: {getTenantSlug()}</span>
          <button onClick={handleLogout} className="hover:text-slate-900">
            Odhlásit
          </button>
        </div>
      </div>
    </header>
  );
}
