'use client';

import { useT } from '@/i18n/I18nProvider';
import type { PublicBranch } from '@/lib/api';

export function BranchStep({
  branches,
  onPick,
}: {
  branches: PublicBranch[];
  onPick: (branch: PublicBranch) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{t('branch.title')}</h2>
        <p className="text-sm text-slate-500 mt-1">{t('branch.subtitle')}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {branches.map((b) => (
          <button
            key={b.id}
            onClick={() => onPick(b)}
            className="text-left p-4 border border-slate-200 rounded-lg hover:border-brand-500 hover:shadow-md transition"
          >
            <div className="font-semibold text-slate-900">{b.name}</div>
            {b.address && <div className="text-sm text-slate-500 mt-1">{b.address}</div>}
            {b.city && <div className="text-xs text-slate-400">{b.city}</div>}
            {b.phone && <div className="text-xs text-slate-400 mt-1">{b.phone}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
