'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  getAccessToken,
  getCatalogProfile,
  updateCatalogProfile,
  uploadFile,
  type CatalogProfile,
} from '@/lib/api';

const DAYS: Array<{ key: string; label: string }> = [
  { key: 'mon', label: 'Pondělí' },
  { key: 'tue', label: 'Úterý' },
  { key: 'wed', label: 'Středa' },
  { key: 'thu', label: 'Čtvrtek' },
  { key: 'fri', label: 'Pátek' },
  { key: 'sat', label: 'Sobota' },
  { key: 'sun', label: 'Neděle' },
];

export default function CatalogSettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<CatalogProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  useEffect(() => {
    getCatalogProfile()
      .then(setProfile)
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

  function patch(p: Partial<CatalogProfile>): void {
    if (!profile) return;
    setProfile({ ...profile, ...p });
  }

  function setHour(day: string, value: string): void {
    if (!profile) return;
    const hours = { ...profile.publicBusinessHours };
    if (value.trim() === '') {
      delete hours[day];
    } else {
      hours[day] = value;
    }
    setProfile({ ...profile, publicBusinessHours: hours });
  }

  async function addPhotoFromFile(file: File): Promise<void> {
    if (!profile) return;
    if (profile.publicPhotos.length >= 10) {
      alert('Max 10 fotek.');
      return;
    }
    try {
      const url = await uploadFile(file, 'catalog-photo');
      setProfile({ ...profile, publicPhotos: [...profile.publicPhotos, url] });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload selhal.');
    }
  }

  function addPhotoFromUrl(): void {
    if (!profile) return;
    const url = prompt('URL fotografie (https://…):');
    if (!url) return;
    if (profile.publicPhotos.length >= 10) {
      alert('Max 10 fotek.');
      return;
    }
    setProfile({ ...profile, publicPhotos: [...profile.publicPhotos, url] });
  }

  function removePhoto(idx: number): void {
    if (!profile) return;
    setProfile({
      ...profile,
      publicPhotos: profile.publicPhotos.filter((_, i) => i !== idx),
    });
  }

  async function handleSave(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const next = await updateCatalogProfile(profile);
      setProfile(next);
      setSuccess('Uloženo. Změny se v katalogu projeví do 5 minut.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba při ukládání');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">Načítám…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavHeader />
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-2">Veřejný katalog</h1>
        <p className="text-slate-600 mb-8">
          Buď viditelný na <code className="bg-slate-100 px-1 rounded">reserved.cz/katalog</code>.
          Klienti tě najdou podle města a oboru a rezervují přes náš widget — bez komise.
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

        <form onSubmit={handleSave} className="space-y-6">
          {/* Toggle */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={profile.listedInCatalog}
                onChange={(e) => patch({ listedInCatalog: e.target.checked })}
                className="mt-1 w-5 h-5"
              />
              <div>
                <div className="font-semibold">Zobrazovat v katalogu reserved.cz</div>
                <p className="text-sm text-slate-600 mt-1">
                  Pokud zapnuto, tvůj salon se objeví v public listing. Bez tohoto checku zůstaneš
                  neviditelný a klienti tě musí dohledávat přes přímou URL.
                </p>
              </div>
            </label>
          </section>

          {/* Description */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-bold text-lg">Profil</h2>

            <div>
              <label className="block text-sm font-medium mb-1">Město</label>
              <input
                type="text"
                value={profile.publicCity ?? ''}
                onChange={(e) => patch({ publicCity: e.target.value || null })}
                placeholder="Praha"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Adresa</label>
              <input
                type="text"
                value={profile.publicAddress ?? ''}
                onChange={(e) => patch({ publicAddress: e.target.value || null })}
                placeholder="Náměstí Republiky 1, 110 00 Praha 1"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Popis (markdown, max 5000 znaků)
              </label>
              <textarea
                value={profile.publicDescription ?? ''}
                onChange={(e) => patch({ publicDescription: e.target.value || null })}
                rows={6}
                maxLength={5000}
                placeholder="Napiš pár vět o svém studiu — co děláte, co děláte výjimečně, jakou máte atmosféru…"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">
                {profile.publicDescription?.length ?? 0} / 5000
              </p>
            </div>
          </section>

          {/* Photos */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">Fotografie</h2>
              <div className="flex gap-2">
                <label className="text-sm text-brand-700 hover:text-brand-800 font-semibold cursor-pointer">
                  + Nahrát soubor
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(ev) => {
                      const f = ev.target.files?.[0];
                      if (f) {
                        void addPhotoFromFile(f);
                      }
                      ev.target.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={addPhotoFromUrl}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Vložit URL
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              První fotka slouží jako cover v katalogu. Max 10 fotek, 5 MB / foto.
            </p>
            {profile.publicPhotos.length === 0 ? (
              <p className="text-sm text-slate-400">Žádné fotky.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {profile.publicPhotos.map((url, i) => (
                  <div key={i} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Foto ${i + 1}`}
                      className="w-full h-24 object-cover rounded-lg border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 bg-white/90 rounded-full w-6 h-6 text-red-600 opacity-0 group-hover:opacity-100 transition"
                      aria-label="Odstranit"
                    >
                      ×
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-1 left-1 bg-brand-600 text-white text-xs px-2 py-0.5 rounded">
                        Cover
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Business hours */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="font-bold text-lg mb-4">Otevírací hodiny</h2>
            <div className="space-y-2">
              {DAYS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="w-24 text-sm">{label}</label>
                  <input
                    type="text"
                    value={profile.publicBusinessHours[key] ?? ''}
                    onChange={(e) => setHour(key, e.target.value)}
                    placeholder="9:00–18:00"
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Prázdné pole = zavřeno. Formát volný (např. „9:00–18:00" nebo „dle objednání").
            </p>
          </section>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-50"
            >
              {busy ? 'Ukládám…' : 'Uložit'}
            </button>
            <a
              href={`http://localhost:4005/katalog`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-700 hover:text-brand-800 font-semibold px-6 py-2"
            >
              Otevřít katalog →
            </a>
          </div>
        </form>
      </main>
    </div>
  );
}
