'use client';

// Sprint 8.2-C: Photo upload komponenta.
// Klient klikne, vybere soubor, my volame /admin/uploads/sign → PUT na storage.

import { useRef, useState } from 'react';
import { uploadFile } from '@/lib/api';

const MAX_MB = 5;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

export function PhotoUpload({
  kind,
  currentUrl,
  onUploaded,
  label = 'Nahrát fotku',
}: {
  kind: 'logo' | 'catalog-photo' | 'service-image';
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(ev: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = ev.target.files?.[0];
    if (!file) return;

    setError(null);

    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Soubor je moc velký. Max ${MAX_MB} MB.`);
      return;
    }
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('Podporované formáty: JPEG, PNG, WEBP, GIF.');
      return;
    }

    setBusy(true);
    try {
      const url = await uploadFile(file, kind);
      onUploaded(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nahrání selhalo.');
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      {currentUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentUrl}
          alt="Náhled"
          className="max-h-24 rounded-lg border border-slate-200 object-contain bg-slate-50"
        />
      )}
      <input
        ref={ref}
        type="file"
        accept={ACCEPT}
        onChange={handleSelect}
        disabled={busy}
        className="hidden"
        id={`upload-${kind}`}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="bg-white border border-slate-300 hover:border-brand-500 text-slate-700 font-medium px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          {busy ? 'Nahrávám…' : currentUrl ? '📷 Změnit' : `📷 ${label}`}
        </button>
        {currentUrl && (
          <button
            type="button"
            onClick={() => onUploaded('')}
            disabled={busy}
            className="text-red-600 hover:text-red-700 text-sm"
          >
            Odstranit
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-500">Max {MAX_MB} MB. JPEG / PNG / WEBP / GIF.</p>
    </div>
  );
}
