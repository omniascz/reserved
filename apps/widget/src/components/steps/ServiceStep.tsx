'use client';

import { useEffect, useState } from 'react';
import { listServices, type PublicService } from '@/lib/api';
import { formatPrice, formatDuration } from '@/lib/format';

export function ServiceStep({
  slug,
  onPick,
}: {
  slug: string;
  onPick: (service: PublicService) => void;
}) {
  const [services, setServices] = useState<PublicService[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listServices(slug)
      .then(setServices)
      .catch((e) => setError(e?.message ?? 'Chyba'));
  }, [slug]);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!services) return <div className="text-slate-400">Načítám služby…</div>;
  if (services.length === 0)
    return (
      <div className="text-slate-500 text-center py-8">
        Tento salon zatím nemá veřejně dostupné služby.
      </div>
    );

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Vyber službu</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {services.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s)}
            className="text-left p-4 border border-slate-200 rounded-lg hover:border-brand-500 hover:shadow-md transition group"
            style={s.color ? { borderLeftColor: s.color, borderLeftWidth: '4px' } : undefined}
          >
            <div className="font-semibold text-slate-900 group-hover:text-brand-700">{s.name}</div>
            {s.description && (
              <div className="text-sm text-slate-500 mt-1 line-clamp-2">{s.description}</div>
            )}
            <div className="flex justify-between mt-3 text-sm">
              <span className="text-slate-500">{formatDuration(s.durationMinutes)}</span>
              <span className="font-semibold text-slate-900">
                {formatPrice(s.priceHellers, s.currency)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
