'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  getAccessToken,
  getTheme,
  updateTheme,
  getTenantSlug,
  type TenantTheme,
} from '@/lib/api';

const RADIUS_OPTIONS: Array<{ value: NonNullable<TenantTheme['borderRadius']>; label: string }> = [
  { value: 'none', label: 'Ostré' },
  { value: 'sm', label: 'Lehce zaoblené' },
  { value: 'md', label: 'Středně' },
  { value: 'lg', label: 'Hodně (default)' },
  { value: 'xl', label: 'Extra' },
];

const FONT_OPTIONS: Array<{ value: NonNullable<TenantTheme['fontFamily']>; label: string }> = [
  { value: 'system', label: 'System (default)' },
  { value: 'sans', label: 'Inter (moderní)' },
  { value: 'serif', label: 'Georgia (klasický)' },
];

const WIDGET_URL = process.env.NEXT_PUBLIC_WIDGET_URL ?? 'http://localhost:4004';

export default function ThemeSettingsPage() {
  const router = useRouter();
  const [theme, setTheme] = useState<TenantTheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slug = getTenantSlug();

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  useEffect(() => {
    getTheme()
      .then(setTheme)
      .catch((e) => {
        if (e instanceof AdminApiError && e.status === 401) {
          clearAuth();
          router.replace('/login');
        } else {
          setError(e?.message ?? 'Chyba');
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  function patch(p: Partial<TenantTheme>): void {
    if (!theme) return;
    setTheme({ ...theme, ...p });
  }

  async function handleSave(): Promise<void> {
    if (!theme) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const next = await updateTheme(theme);
      setTheme(next);
      setSuccess('Vzhled uložen. Změny se v widgetu projeví okamžitě.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(): Promise<void> {
    if (!confirm('Vrátit vše do výchozího (modrá, zaoblené, system font)?')) return;
    setBusy(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const next = await updateTheme({
        primaryColor: null,
        borderRadius: null,
        fontFamily: null,
        logoUrl: null,
        backgroundColor: null,
        customCss: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      setTheme(next);
      setSuccess('Vráceno do výchozího.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !theme) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">Načítám…</div>
      </div>
    );
  }

  const previewColor = theme.primaryColor ?? '#3b82f6';
  const previewUrl = slug ? `${WIDGET_URL}/${slug}` : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <NavHeader />
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-2">Vzhled rezervačního widgetu</h1>
        <p className="text-slate-600 mb-8">
          Nastav barvu, font a logo. Tyto změny uvidí klienti při rezervaci přes widget.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-800 p-3 rounded mb-4 text-sm">
            {success}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Nastaveni */}
          <div className="space-y-4">
            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="font-bold text-lg">Barvy a styl</h2>

              <div>
                <label className="block text-sm font-medium mb-2">Hlavní barva (primary)</label>
                <div className="flex gap-3 items-center">
                  <input
                    type="color"
                    value={previewColor}
                    onChange={(e) => patch({ primaryColor: e.target.value })}
                    className="w-16 h-12 border border-slate-300 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.primaryColor ?? ''}
                    onChange={(e) => patch({ primaryColor: e.target.value || undefined })}
                    placeholder="#3b82f6 (výchozí modrá)"
                    pattern="^#[0-9a-fA-F]{6}$"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Tlačítka a zvýraznění. Hex formát #RRGGBB.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Zaoblení rohů</label>
                <select
                  value={theme.borderRadius ?? 'lg'}
                  onChange={(e) =>
                    patch({ borderRadius: e.target.value as TenantTheme['borderRadius'] })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  {RADIUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Font</label>
                <select
                  value={theme.fontFamily ?? 'system'}
                  onChange={(e) =>
                    patch({ fontFamily: e.target.value as TenantTheme['fontFamily'] })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  {FONT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Logo URL (volitelné)</label>
                <input
                  type="url"
                  value={theme.logoUrl ?? ''}
                  onChange={(e) => patch({ logoUrl: e.target.value || undefined })}
                  placeholder="https://www.tvojesite.cz/logo.png"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Zobrazí se v hlavičce widgetu vedle názvu salonu.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Barva pozadí widgetu</label>
                <div className="flex gap-3 items-center">
                  <input
                    type="color"
                    value={theme.backgroundColor ?? '#f8fafc'}
                    onChange={(e) => patch({ backgroundColor: e.target.value })}
                    className="w-16 h-12 border border-slate-300 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.backgroundColor ?? ''}
                    onChange={(e) => patch({ backgroundColor: e.target.value || undefined })}
                    placeholder="#f8fafc (světle šedá)"
                    pattern="^#[0-9a-fA-F]{6}$"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Pozadí celého widgetu. Default je světle šedá.
                </p>
              </div>
            </section>

            {/* Custom CSS (advanced) */}
            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="font-bold text-lg mb-3">Pokročilé: Custom CSS</h2>
              <p className="text-sm text-slate-600 mb-3">
                Pro pixel-perfect ladění. Pozor: chybné CSS může widget rozbít. Bezpečnostně se
                blokují <code className="bg-slate-100 px-1 rounded">&lt;script&gt;</code>,{' '}
                <code className="bg-slate-100 px-1 rounded">javascript:</code>,{' '}
                <code className="bg-slate-100 px-1 rounded">@import</code>.
              </p>
              <textarea
                value={theme.customCss ?? ''}
                onChange={(e) => patch({ customCss: e.target.value || undefined })}
                placeholder={`/* Příklad */\n.bg-brand-600 { background: linear-gradient(45deg, #ff6b6b, #ee5a6f); }`}
                rows={8}
                maxLength={10000}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs"
              />
              <p className="text-xs text-slate-500 mt-1">
                {theme.customCss?.length ?? 0} / 10 000 znaků
              </p>
            </section>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={busy}
                className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-50"
              >
                {busy ? 'Ukládám…' : 'Uložit'}
              </button>
              <button
                onClick={handleReset}
                disabled={busy}
                className="text-slate-600 hover:text-slate-900 px-4 py-2"
              >
                Vrátit do výchozího
              </button>
            </div>
          </div>

          {/* Live preview */}
          <div className="space-y-4">
            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="font-bold text-lg mb-3">Náhled</h2>
              <div
                className="border border-slate-200 rounded-lg p-6 space-y-4"
                style={{
                  borderRadius:
                    theme.borderRadius === 'none'
                      ? '0'
                      : theme.borderRadius === 'sm'
                        ? '0.25rem'
                        : theme.borderRadius === 'md'
                          ? '0.5rem'
                          : theme.borderRadius === 'xl'
                            ? '1rem'
                            : '0.75rem',
                  fontFamily:
                    theme.fontFamily === 'serif'
                      ? 'Georgia, serif'
                      : theme.fontFamily === 'sans'
                        ? 'Inter, sans-serif'
                        : undefined,
                }}
              >
                <div className="font-bold">Vzorová služba</div>
                <button
                  type="button"
                  style={{
                    backgroundColor: previewColor,
                    borderRadius:
                      theme.borderRadius === 'none'
                        ? '0'
                        : theme.borderRadius === 'sm'
                          ? '0.25rem'
                          : theme.borderRadius === 'md'
                            ? '0.5rem'
                            : theme.borderRadius === 'xl'
                              ? '1rem'
                              : '0.75rem',
                  }}
                  className="text-white font-semibold px-6 py-2"
                >
                  Rezervovat termín
                </button>
                <p className="text-sm text-slate-600">
                  Takhle budou vypadat tlačítka a hlavní prvky v rezervačním widgetu.
                </p>
              </div>
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block text-brand-700 hover:text-brand-800 font-semibold text-sm"
                >
                  Otevřít skutečný widget v novém okně →
                </a>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
