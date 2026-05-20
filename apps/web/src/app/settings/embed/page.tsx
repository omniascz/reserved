'use client';

// Sprint 8.1: Embed code generator — tenant zkopiruje a vlozi na svuj web.
//
// Generuje 3 varianty:
//   1. Iframe responzivni (nejjednodussi)
//   2. Iframe s auto-resize (postMessage listener)
//   3. Tlacitko + popup (otevre widget v novem okne)

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import { clearAuth, getAccessToken, getTenantSlug, AdminApiError } from '@/lib/api';

const WIDGET_URL = process.env.NEXT_PUBLIC_WIDGET_URL ?? 'http://localhost:4004';

type EmbedKind = 'iframe' | 'iframe-resize' | 'button';

export default function EmbedSettingsPage() {
  const router = useRouter();
  const slug = getTenantSlug();
  const [kind, setKind] = useState<EmbedKind>('iframe-resize');
  const [lang, setLang] = useState<'cs' | 'en'>('cs');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  if (!slug) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500">Tenant slug se nepodařilo načíst.</div>
      </div>
    );
  }

  const widgetSrc = `${WIDGET_URL}/${slug}${lang === 'en' ? '?lang=en' : ''}`;

  const SNIPPETS: Record<EmbedKind, { label: string; description: string; code: string }> = {
    iframe: {
      label: 'Jednoduchý iframe',
      description:
        'Fixní výška 800px. Funguje všude. Vhodné když nepotřebuješ aby se výška měnila podle obsahu.',
      code: `<iframe
  src="${widgetSrc}"
  width="100%"
  height="800"
  style="border:0; max-width:600px;"
  title="Online rezervace"
></iframe>`,
    },
    'iframe-resize': {
      label: 'Iframe s auto-resize (doporučené)',
      description:
        'Výška iframe se automaticky přizpůsobuje obsahu widgetu — žádný scroll uvnitř. Vyžaduje malý JS snippet.',
      code: `<iframe
  id="reserved-widget"
  src="${widgetSrc}"
  width="100%"
  height="600"
  style="border:0; max-width:600px;"
  title="Online rezervace"
></iframe>
<script>
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'reserved:resize') {
      var f = document.getElementById('reserved-widget');
      if (f) f.style.height = e.data.height + 'px';
    }
  });
</script>`,
    },
    button: {
      label: 'Tlačítko (popup)',
      description:
        'Místo iframe na stránce zobrazíme tlačítko, které otevře widget v novém okně. Vhodné pokud chceš mít rezervaci minimalistickou.',
      code: `<a
  href="${widgetSrc}"
  target="_blank"
  rel="noopener"
  style="display:inline-block; background:#3b82f6; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;"
>
  Rezervovat online →
</a>`,
    },
  };

  async function copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(SNIPPETS[kind].code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Kopírování selhalo. Označ kód a zkopíruj ručně.');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavHeader />
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-2">Vložit widget na můj web</h1>
        <p className="text-slate-600 mb-8">
          Zkopíruj jeden z níže uvedených kódů a vlož ho na svůj web tam, kam chceš rezervační
          formulář. Funguje na všech systémech (Wordpress, Squarespace, Wix, vlastní web…).
        </p>

        {/* Varianty */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-3">1. Vyber způsob vložení</h2>
          <div className="space-y-2">
            {(Object.keys(SNIPPETS) as EmbedKind[]).map((k) => (
              <label
                key={k}
                className={`block border-2 rounded-lg p-3 cursor-pointer transition ${
                  kind === k
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="mr-2"
                />
                <strong>{SNIPPETS[k].label}</strong>
                <p className="text-sm text-slate-600 mt-1 ml-6">{SNIPPETS[k].description}</p>
              </label>
            ))}
          </div>
        </section>

        {/* Jazyk */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-3">2. Jazyk widgetu</h2>
          <div className="flex gap-3">
            <label className="cursor-pointer">
              <input
                type="radio"
                name="lang"
                value="cs"
                checked={lang === 'cs'}
                onChange={() => setLang('cs')}
                className="mr-2"
              />
              Čeština
            </label>
            <label className="cursor-pointer">
              <input
                type="radio"
                name="lang"
                value="en"
                checked={lang === 'en'}
                onChange={() => setLang('en')}
                className="mr-2"
              />
              English
            </label>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Pokud potřebuješ obě verze, vlož na svůj web 2 widgety s různým jazykem.
          </p>
        </section>

        {/* Snippet */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">3. Zkopíruj kód</h2>
            <button
              onClick={copyCode}
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg text-sm"
            >
              {copied ? '✓ Zkopírováno' : '📋 Zkopírovat kód'}
            </button>
          </div>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-xs">
            <code>{SNIPPETS[kind].code}</code>
          </pre>
        </section>

        {/* Instrukce pro platformy */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-3">4. Vlož na svůj web</h2>

          <details className="mb-3">
            <summary className="cursor-pointer font-semibold">📝 Wordpress</summary>
            <ol className="text-sm text-slate-700 mt-2 ml-6 space-y-1 list-decimal">
              <li>Vytvoř novou stránku nebo edituj existující</li>
              <li>
                Přepni do <strong>HTML / Code</strong> bloku (ne Visual)
              </li>
              <li>Vlož kód</li>
              <li>Publikuj</li>
            </ol>
          </details>

          <details className="mb-3">
            <summary className="cursor-pointer font-semibold">🟦 Squarespace</summary>
            <ol className="text-sm text-slate-700 mt-2 ml-6 space-y-1 list-decimal">
              <li>
                Edit stránku → přidat blok → <strong>Code</strong>
              </li>
              <li>Vlož kód</li>
              <li>Save</li>
            </ol>
          </details>

          <details className="mb-3">
            <summary className="cursor-pointer font-semibold">⚡ Webflow</summary>
            <ol className="text-sm text-slate-700 mt-2 ml-6 space-y-1 list-decimal">
              <li>
                Drag <strong>Embed</strong> element z Add panelu
              </li>
              <li>Vlož kód do dialogu</li>
              <li>Publish</li>
            </ol>
          </details>

          <details className="mb-3">
            <summary className="cursor-pointer font-semibold">🛠️ Vlastní web / HTML</summary>
            <p className="text-sm text-slate-700 mt-2 ml-6">
              Vlož kód mezi <code>&lt;body&gt;</code> tagy tam, kam chceš rezervační formulář. Žádné
              dependencies, vše je samostatné.
            </p>
          </details>

          <details>
            <summary className="cursor-pointer font-semibold">🛍️ Shopify, Wix, jiné</summary>
            <p className="text-sm text-slate-700 mt-2 ml-6">
              Většina platforem má <strong>Embed HTML / Custom Code</strong> blok. Hledej v editoru
              stránky. Pokud nemůžeš najít, napiš na{' '}
              <a href="mailto:podpora@reserved.cz" className="text-brand-700 hover:underline">
                podpora@reserved.cz
              </a>{' '}
              — pomůžeme.
            </p>
          </details>
        </section>

        {/* Preview link */}
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h2 className="font-bold mb-2">💡 Vyzkoušej widget před vložením</h2>
          <p className="text-sm text-slate-700 mb-3">
            Otevři widget v novém okně a projdi celý flow rezervace tak, jak ho uvidí klient.
          </p>
          <a
            href={widgetSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-white border border-slate-300 hover:border-brand-500 text-slate-900 font-semibold px-4 py-2 rounded-lg"
          >
            Otevřít widget {lang === 'en' && '(EN)'} →
          </a>
        </section>
      </main>
    </div>
  );
}
