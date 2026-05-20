'use client';

// Sprint 9.0-G: Admin editor pro tenant mini-web.
// Tenant tady vybere šablonu, edituje obsah sekcí a publikuje.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  getAccessToken,
  getSiteSettings,
  getTenantSlug,
  updateSiteSettings,
  uploadFile,
  type SiteContent,
  type SiteSettings,
  type SiteTemplate,
} from '@/lib/api';

const TENANT_SITE_URL = process.env.NEXT_PUBLIC_TENANT_SITE_URL ?? 'http://localhost:4006';

const TEMPLATES: Array<{
  id: SiteTemplate;
  name: string;
  description: string;
  recommended: string;
  preview: string;
}> = [
  {
    id: 'elegant',
    name: 'Elegant',
    description: 'Světlá, minimalistická. Serif font, prostorné, jemné akcenty.',
    recommended: 'Kadeřnictví, beauty salony, lékařské ordinace',
    preview: 'bg-gradient-to-br from-stone-50 to-stone-100 text-stone-900',
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Tmavá, výrazná. Sans-serif, kontrastní, masculine.',
    recommended: 'Barber shopy, tetování, fitness pro muže',
    preview: 'bg-gradient-to-br from-slate-900 to-zinc-800 text-white',
  },
  {
    id: 'fresh',
    name: 'Fresh',
    description: 'Barevná, energická. Rounded, hravá, moderní.',
    recommended: 'Fitness, jóga, dětské služby, autoškoly',
    preview: 'bg-gradient-to-br from-amber-100 to-rose-100 text-slate-900',
  },
];

export default function SiteSettingsPage() {
  const router = useRouter();
  const slug = getTenantSlug();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string | null>('hero');

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  useEffect(() => {
    getSiteSettings()
      .then(setSettings)
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

  function patchContent(section: keyof SiteContent, value: unknown): void {
    if (!settings) return;
    setSettings({
      ...settings,
      content: { ...settings.content, [section]: value },
    });
  }

  function patchSettings(patch: Partial<SiteSettings>): void {
    if (!settings) return;
    setSettings({ ...settings, ...patch });
  }

  async function handleSave(): Promise<void> {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const next = await updateSiteSettings({
        template: settings.template,
        enabled: settings.enabled,
        content: settings.content,
      });
      setSettings(next);
      setSuccess('Uloženo. Změny jsou viditelné okamžitě.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  async function handlePhotoUpload(
    field: 'coverPhotoUrl' | 'aboutPhoto',
    file: File,
  ): Promise<void> {
    setBusy(true);
    try {
      const url = await uploadFile(file, 'catalog-photo');
      if (field === 'coverPhotoUrl') {
        patchContent('hero', { ...settings?.content.hero, coverPhotoUrl: url });
      } else {
        patchContent('about', { ...settings?.content.about, photoUrl: url });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload selhal');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">Načítám…</div>
      </div>
    );
  }

  const previewUrl = slug ? `${TENANT_SITE_URL}?preview-slug=${slug}` : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <NavHeader />
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-start justify-between mb-2">
          <h1 className="text-3xl font-bold">Mini-web</h1>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-700 hover:underline font-semibold"
            >
              👁 Náhled →
            </a>
          )}
        </div>
        <p className="text-slate-600 mb-8">
          Vlastní mini-web na tvé doméně — jednodušší a profesionálnější než Wix nebo Squarespace.
          Vybereš šablonu, vyplníš obsah, publikuješ.
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

        {/* PUBLISHED TOGGLE */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => patchSettings({ enabled: e.target.checked })}
              className="mt-1 w-5 h-5"
            />
            <div>
              <div className="font-semibold">Publikovat mini-web</div>
              <p className="text-sm text-slate-600 mt-1">
                {settings.enabled ? (
                  <>
                    ✅ Tvůj mini-web je veřejný na{' '}
                    <code className="bg-slate-100 px-1 rounded">{previewUrl}</code> a na tvé custom
                    doméně (pokud máš nastavenou).
                  </>
                ) : (
                  <>
                    ⏸ Vypnutý — návštěvníci tvé custom domény budou přesměrováni na widget. Náhled
                    si stále můžeš prohlédnout.
                  </>
                )}
              </p>
            </div>
          </label>
        </section>

        {/* TEMPLATE SELECTOR */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-4">1. Vyber šablonu</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {TEMPLATES.map((t) => {
              const isSelected = settings.template === t.id;
              return (
                <label
                  key={t.id}
                  className={`block cursor-pointer rounded-xl overflow-hidden border-2 transition ${
                    isSelected
                      ? 'border-brand-500 shadow-lg'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="template"
                    value={t.id}
                    checked={isSelected}
                    onChange={() => patchSettings({ template: t.id })}
                    className="sr-only"
                  />
                  <div className={`h-32 flex items-center justify-center ${t.preview}`}>
                    <div className="text-center">
                      <div className="font-serif text-2xl">{t.name}</div>
                      <div className="text-xs opacity-60 mt-1">Náhled</div>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="font-bold mb-1">{t.name}</div>
                    <p className="text-xs text-slate-600 mb-2">{t.description}</p>
                    <p className="text-xs text-slate-500 italic">{t.recommended}</p>
                  </div>
                </label>
              );
            })}
          </div>
          {settings.template !== 'elegant' && (
            <p className="text-xs text-amber-700 mt-3 bg-amber-50 p-2 rounded">
              ⚠️ Šablona „{settings.template}&quot; je momentálně v přípravě — zobrazí se jako
              Elegant. Přidáme ji v dalším release.
            </p>
          )}
        </section>

        {/* CONTENT SECTIONS */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-4">2. Vyplň obsah sekcí</h2>
          <p className="text-sm text-slate-600 mb-4">
            Klikni na sekci pro úpravu. Vše se ukládá až po kliknutí na „Uložit&quot; dole.
          </p>

          <div className="space-y-2">
            <SectionEditor
              id="hero"
              title="🎯 Hero (úvod)"
              open={openSection === 'hero'}
              onToggle={() => setOpenSection(openSection === 'hero' ? null : 'hero')}
            >
              <input
                type="text"
                value={settings.content.hero?.headline ?? ''}
                onChange={(e) =>
                  patchContent('hero', {
                    ...settings.content.hero,
                    headline: e.target.value || undefined,
                  })
                }
                placeholder="Hlavní nadpis (např. Tvůj salon pro krásu)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-2"
              />
              <textarea
                value={settings.content.hero?.subheadline ?? ''}
                onChange={(e) =>
                  patchContent('hero', {
                    ...settings.content.hero,
                    subheadline: e.target.value || undefined,
                  })
                }
                placeholder="Podnadpis / krátký popis (1-2 věty)"
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-2"
              />
              <input
                type="text"
                value={settings.content.hero?.ctaText ?? ''}
                onChange={(e) =>
                  patchContent('hero', {
                    ...settings.content.hero,
                    ctaText: e.target.value || undefined,
                  })
                }
                placeholder="Text tlačítka (default: Rezervovat termín)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-2"
              />
              <label className="block">
                <span className="block text-sm font-medium mb-1">Cover fotka</span>
                {settings.content.hero?.coverPhotoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={settings.content.hero.coverPhotoUrl}
                    alt=""
                    className="max-h-32 mb-2 rounded border border-slate-200"
                  />
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handlePhotoUpload('coverPhotoUrl', f);
                    e.target.value = '';
                  }}
                  className="text-sm"
                />
              </label>
            </SectionEditor>

            <SectionEditor
              id="about"
              title="📖 O nás"
              open={openSection === 'about'}
              onToggle={() => setOpenSection(openSection === 'about' ? null : 'about')}
            >
              <input
                type="text"
                value={settings.content.about?.headline ?? ''}
                onChange={(e) =>
                  patchContent('about', {
                    ...settings.content.about,
                    headline: e.target.value || undefined,
                  })
                }
                placeholder="Nadpis sekce"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-2"
              />
              <textarea
                value={settings.content.about?.text ?? ''}
                onChange={(e) =>
                  patchContent('about', {
                    ...settings.content.about,
                    text: e.target.value || undefined,
                  })
                }
                placeholder="Příběh, hodnoty, čím jste výjimeční (volně formátovaný text)"
                rows={6}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-2"
              />
              <label className="block">
                <span className="block text-sm font-medium mb-1">Doprovodná fotka (volitelné)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handlePhotoUpload('aboutPhoto', f);
                    e.target.value = '';
                  }}
                  className="text-sm"
                />
              </label>
            </SectionEditor>

            <SectionEditor
              id="faq"
              title="❓ Časté otázky"
              open={openSection === 'faq'}
              onToggle={() => setOpenSection(openSection === 'faq' ? null : 'faq')}
            >
              <FaqEditor
                items={settings.content.faq?.items ?? []}
                onChange={(items) => patchContent('faq', { ...settings.content.faq, items })}
              />
            </SectionEditor>

            <SectionEditor
              id="contact"
              title="📞 Kontakt"
              open={openSection === 'contact'}
              onToggle={() => setOpenSection(openSection === 'contact' ? null : 'contact')}
            >
              <input
                type="tel"
                value={settings.content.contact?.phone ?? ''}
                onChange={(e) =>
                  patchContent('contact', {
                    ...settings.content.contact,
                    phone: e.target.value || undefined,
                  })
                }
                placeholder="Telefon (např. +420 777 123 456)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-2"
              />
              <input
                type="email"
                value={settings.content.contact?.email ?? ''}
                onChange={(e) =>
                  patchContent('contact', {
                    ...settings.content.contact,
                    email: e.target.value || undefined,
                  })
                }
                placeholder="Kontaktní email"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-2"
              />
              <input
                type="url"
                value={settings.content.contact?.mapEmbedUrl ?? ''}
                onChange={(e) =>
                  patchContent('contact', {
                    ...settings.content.contact,
                    mapEmbedUrl: e.target.value || undefined,
                  })
                }
                placeholder="Google Maps embed URL (z 'Share → Embed map')"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-2"
              />
              <p className="text-xs text-slate-500">
                Adresa, město a otevírací hodiny se berou z{' '}
                <a href="/settings/catalog" className="text-brand-700 underline">
                  /settings/catalog
                </a>
                .
              </p>
            </SectionEditor>
          </div>
        </section>

        {/* SAVE */}
        <div className="flex justify-between items-center">
          <p className="text-sm text-slate-500">
            Tip: nezapomeň po úpravách kliknout na <strong>Uložit</strong>.
          </p>
          <button
            onClick={handleSave}
            disabled={busy}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3 rounded-lg disabled:opacity-50"
          >
            {busy ? 'Ukládám…' : '💾 Uložit'}
          </button>
        </div>
      </main>
    </div>
  );
}

function SectionEditor({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-medium flex justify-between items-center"
      >
        <span>{title}</span>
        <span className={open ? 'rotate-180' : ''}>▼</span>
      </button>
      {open && <div className="p-4 space-y-2">{children}</div>}
    </div>
  );
}

function FaqEditor({
  items,
  onChange,
}: {
  items: Array<{ q: string; a: string }>;
  onChange: (items: Array<{ q: string; a: string }>) => void;
}) {
  function add(): void {
    onChange([...items, { q: '', a: '' }]);
  }
  function remove(i: number): void {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function update(i: number, field: 'q' | 'a', value: string): void {
    onChange(items.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="bg-slate-50 p-3 rounded">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">Otázka #{i + 1}</span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-red-600 hover:text-red-700 text-sm"
            >
              Odstranit
            </button>
          </div>
          <input
            type="text"
            value={item.q}
            onChange={(e) => update(i, 'q', e.target.value)}
            placeholder="Otázka"
            className="w-full px-3 py-2 border border-slate-300 rounded mb-2 text-sm"
          />
          <textarea
            value={item.a}
            onChange={(e) => update(i, 'a', e.target.value)}
            placeholder="Odpověď"
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-sm text-brand-700 hover:text-brand-800 font-semibold"
      >
        + Přidat otázku
      </button>
    </div>
  );
}
