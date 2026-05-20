'use client';

// Vizualizace no-show rizika klienta. Použij na customer detail + booking list.
//
// Sprint 8.0-2: rule-based risk z historie posledních 10 rezervací.

import { useEffect, useState } from 'react';
import { getNoShowRisk, type NoShowRisk } from '@/lib/api';

const COLORS: Record<
  NoShowRisk['level'],
  { bg: string; text: string; icon: string; label: string }
> = {
  low: { bg: 'bg-green-100', text: 'text-green-800', icon: '🟢', label: 'Nízké riziko' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-800', icon: '🟡', label: 'Střední' },
  high: { bg: 'bg-red-100', text: 'text-red-800', icon: '🔴', label: 'Vysoké riziko' },
};

export function NoShowRiskBadge({
  customerId,
  showDetails = false,
}: {
  customerId: string;
  showDetails?: boolean;
}) {
  const [risk, setRisk] = useState<NoShowRisk | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNoShowRisk(customerId)
      .then((data) => {
        if (!cancelled) setRisk(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Chyba');
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (error) {
    return <span className="text-xs text-slate-400">⚠️ {error}</span>;
  }
  if (!risk) {
    return <span className="text-xs text-slate-400">…</span>;
  }

  const c = COLORS[risk.level]!;

  if (!showDetails) {
    // Kompaktní badge — pro booking list
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}
        title={risk.reasons.join(' ')}
      >
        {c.icon} {c.label}
      </span>
    );
  }

  // Podrobný panel — pro customer detail
  return (
    <div
      className={`rounded-xl border p-4 ${c.bg.replace('bg-', 'border-').replace('100', '300')} ${c.bg}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`font-bold ${c.text}`}>
          {c.icon} No-show riziko: {c.label}
        </span>
        <span className={`text-xs font-mono ${c.text}`}>{risk.score} / 100</span>
      </div>
      <ul className={`text-sm space-y-1 ${c.text}`}>
        {risk.reasons.map((r: string, i: number) => (
          <li key={i}>· {r}</li>
        ))}
      </ul>
      <div className="mt-3 text-xs text-slate-600 grid grid-cols-3 gap-2">
        <div>
          <div className="font-semibold">{risk.stats.totalBookings}</div>
          <div>Rezervací</div>
        </div>
        <div>
          <div className="font-semibold text-emerald-600">{risk.stats.completedBookings}</div>
          <div>Dokončeno</div>
        </div>
        <div>
          <div className="font-semibold text-red-600">{risk.stats.noShowCount}</div>
          <div>No-show</div>
        </div>
      </div>
    </div>
  );
}
