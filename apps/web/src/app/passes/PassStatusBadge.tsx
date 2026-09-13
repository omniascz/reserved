'use client';

// Stav permanentky. Ukazujeme VŽDY vypočtený stav (effectiveStatus) — uložený
// sloupec lže (propadlá permanentka v DB běžně zůstává 'active'). Kde se oba
// liší, přidáme drobnou poznámku, ať je rozdíl vidět a nepřekvapí.

import type { PassEffectiveStatus } from '@/lib/api';

const STATUS: Record<string, { label: string; color: string }> = {
  active: { label: 'Aktivní', color: 'bg-emerald-100 text-emerald-700' },
  expired: { label: 'Propadlá', color: 'bg-slate-200 text-slate-700' },
  used_up: { label: 'Vyčerpaná', color: 'bg-amber-100 text-amber-800' },
  suspended: { label: 'Pozastavená', color: 'bg-orange-100 text-orange-800' },
  cancelled: { label: 'Zrušená', color: 'bg-red-100 text-red-700' },
  refunded: { label: 'Vrácená', color: 'bg-slate-100 text-slate-600' },
  rolled_over: { label: 'Přenesená', color: 'bg-sky-100 text-sky-800' },
};

export function passStatusLabel(status: string): string {
  return STATUS[status]?.label ?? status;
}

export function PassStatusBadge({
  effectiveStatus,
  storedStatus,
  showMismatch = true,
}: {
  effectiveStatus: string;
  storedStatus?: string;
  showMismatch?: boolean;
}) {
  const s = STATUS[effectiveStatus] ?? { label: effectiveStatus, color: 'bg-slate-100' };
  const mismatch = showMismatch && storedStatus !== undefined && storedStatus !== effectiveStatus;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
      {mismatch && (
        <span
          className="text-[10px] text-slate-400"
          title={`V databázi je uloženo „${passStatusLabel(storedStatus!)}" — stav se počítá z platnosti a zůstatku.`}
        >
          (v DB {passStatusLabel(storedStatus!)})
        </span>
      )}
    </span>
  );
}
