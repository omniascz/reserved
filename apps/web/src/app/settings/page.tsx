'use client';

// Sprint 9.1-D: Settings hub — dlaždice pro všechny sub-pages.

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import { getAccessToken } from '@/lib/api';

interface Tile {
  href: string;
  icon: string;
  title: string;
  description: string;
  badge?: 'new';
  group: 'web' | 'operations' | 'account';
}

const TILES: Tile[] = [
  {
    href: '/settings/theme',
    icon: '🎨',
    title: 'Vzhled widgetu',
    description: 'Barva, font, logo a zaoblení. Aplikuje se na rezervační widget.',
    badge: 'new',
    group: 'web',
  },
  {
    href: '/settings/embed',
    icon: '🔗',
    title: 'Vložit na svůj web',
    description: 'Generátor 1-řádkového kódu pro vložení widgetu (Wordpress, Wix, …).',
    badge: 'new',
    group: 'web',
  },
  {
    href: '/settings/site',
    icon: '🌐',
    title: 'Mini-web',
    description: 'Vlastní mini-stránka s šablonou a integrovanou rezervací.',
    badge: 'new',
    group: 'web',
  },
  {
    href: '/settings/domain',
    icon: '🏷️',
    title: 'Vlastní doména',
    description: 'Napojení booking.svujsalon.cz na Reserved.',
    badge: 'new',
    group: 'web',
  },
  {
    href: '/settings/catalog',
    icon: '📂',
    title: 'Katalog Reserved',
    description: 'Profil v reserved.cz/katalog s popisem a fotkami.',
    badge: 'new',
    group: 'web',
  },
  {
    href: '/settings/rules',
    icon: '⏰',
    title: 'Pravidla rezervací',
    description: 'Časové okno, storno, přesun, slot interval, připomínky.',
    group: 'operations',
  },
];

const GROUP_LABELS: Record<Tile['group'], string> = {
  web: '🌐 Web a widget',
  operations: '⚙️ Provoz',
  account: '👤 Účet',
};

export default function SettingsHubPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const groups: Tile['group'][] = ['web', 'operations'];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <NavHeader />
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <h1 className="text-3xl font-bold mb-2">Nastavení</h1>
        <p className="text-slate-600 mb-8">
          Najdi rychle, co potřebuješ změnit. Klikni na dlaždici.
        </p>

        {groups.map((group) => {
          const tiles = TILES.filter((t) => t.group === group);
          if (tiles.length === 0) return null;
          return (
            <section key={group} className="mb-10">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                {GROUP_LABELS[group]}
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tiles.map((tile) => (
                  <Link
                    key={tile.href}
                    href={tile.href}
                    className="bg-white rounded-xl border border-slate-200 hover:border-brand-300 hover:shadow-md transition p-5 group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-3xl">{tile.icon}</span>
                      {tile.badge === 'new' && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-semibold uppercase">
                          Nové
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-lg mb-1 group-hover:text-brand-700">
                      {tile.title}
                    </h3>
                    <p className="text-sm text-slate-600">{tile.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
