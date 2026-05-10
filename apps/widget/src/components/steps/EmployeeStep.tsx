'use client';

import { useEffect, useState } from 'react';
import { listEmployees, type PublicEmployee, type PublicService } from '@/lib/api';

export function EmployeeStep({
  slug,
  service,
  onPick,
  onBack,
}: {
  slug: string;
  service: PublicService;
  onPick: (employee: PublicEmployee) => void;
  onBack: () => void;
}) {
  const [employees, setEmployees] = useState<PublicEmployee[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEmployees(slug)
      .then(setEmployees)
      .catch((e) => setError(e?.message ?? 'Chyba'));
  }, [slug]);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!employees) return <div className="text-slate-400">Načítám…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Vyber specialistu</h2>
          <p className="text-sm text-slate-500 mt-1">
            Pro službu <span className="font-medium text-slate-700">{service.name}</span>
          </p>
        </div>
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-900">
          ← Zpět
        </button>
      </div>

      {employees.length === 0 ? (
        <div className="text-slate-500 text-center py-8">Tuto službu zatím nikdo nenabízí.</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {employees.map((e) => (
            <button
              key={e.id}
              onClick={() => onPick(e)}
              className="text-left p-4 border border-slate-200 rounded-lg hover:border-brand-500 hover:shadow-md transition flex items-center gap-4"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                style={{ backgroundColor: e.color ?? '#64748b' }}
              >
                {(e.displayName ?? e.firstName).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">
                  {e.displayName ?? `${e.firstName} ${e.lastName}`}
                </div>
                {e.title && <div className="text-sm text-slate-500">{e.title}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
