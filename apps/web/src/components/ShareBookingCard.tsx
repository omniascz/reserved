'use client';

// Sprint 9.1-B: Karta na dashboardu — kde najít rezervační odkaz, jak ho sdílet.

import { useState } from 'react';
import Link from 'next/link';
import { getTenantSlug } from '@/lib/api';

const WIDGET_URL = process.env.NEXT_PUBLIC_WIDGET_URL ?? 'http://localhost:4004';

export function ShareBookingCard() {
  const slug = getTenantSlug();
  const [copied, setCopied] = useState<string | null>(null);

  if (!slug) return null;

  const bookingUrl = `${WIDGET_URL}/${slug}`;
  const embedCode = `<script src="${WIDGET_URL}/embed.js" data-slug="${slug}" defer></script>`;

  async function copy(value: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      alert('Kopírování selhalo. Označ ručně.');
    }
  }

  const encodedUrl = encodeURIComponent(bookingUrl);
  const encodedText = encodeURIComponent('Rezervuj si u nás termín online:');

  return (
    <section className="bg-gradient-to-br from-brand-600 to-brand-800 text-white rounded-xl p-6 mb-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold mb-1">📤 Sdílej rezervační odkaz s klienty</h2>
          <p className="text-brand-100 text-sm">
            Hned po prvním sdílení se ti začnou hrnout rezervace. Vyber způsob, jak je dostat.
          </p>
        </div>
      </div>

      {/* Direct link */}
      <div className="bg-white/10 backdrop-blur rounded-lg p-3 mb-3">
        <div className="flex items-center gap-2">
          <code className="flex-1 font-mono text-sm truncate">{bookingUrl}</code>
          <button
            onClick={() => copy(bookingUrl, 'link')}
            className="bg-white text-brand-700 px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap hover:bg-brand-50"
          >
            {copied === 'link' ? '✓ Zkopírováno' : '📋 Kopírovat'}
          </button>
        </div>
      </div>

      {/* Action buttons row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <a
          href={`https://wa.me/?text=${encodedText}%20${encodedUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white/10 hover:bg-white/20 text-white text-sm py-2 px-3 rounded text-center transition"
        >
          💬 WhatsApp
        </a>
        <a
          href={`mailto:?subject=Online%20rezervace&body=${encodedText}%20${encodedUrl}`}
          className="bg-white/10 hover:bg-white/20 text-white text-sm py-2 px-3 rounded text-center transition"
        >
          ✉️ Email
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white/10 hover:bg-white/20 text-white text-sm py-2 px-3 rounded text-center transition"
        >
          📘 Facebook
        </a>
        <a
          href={bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white/10 hover:bg-white/20 text-white text-sm py-2 px-3 rounded text-center transition"
        >
          👁 Náhled
        </a>
      </div>

      {/* Embed code link */}
      <div className="mt-4 pt-4 border-t border-white/20 flex flex-wrap gap-3 text-sm">
        <Link
          href="/settings/embed"
          className="text-brand-100 hover:text-white underline-offset-2 hover:underline"
        >
          🔗 Vložit na svůj web (snippet)
        </Link>
        <span className="text-brand-300">·</span>
        <Link
          href="/settings/theme"
          className="text-brand-100 hover:text-white underline-offset-2 hover:underline"
        >
          🎨 Nastavit vzhled
        </Link>
        <span className="text-brand-300">·</span>
        <Link
          href="/settings/site"
          className="text-brand-100 hover:text-white underline-offset-2 hover:underline"
        >
          🌐 Vytvořit mini-web
        </Link>
      </div>
    </section>
  );
}
