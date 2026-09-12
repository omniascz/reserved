'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n/I18nProvider';
import { listEmployees, type PublicEmployee, type PublicService } from '@/lib/api';

export function EmployeeStep({
  slug,
  service,
  branchId,
  onPick,
  onBack,
}: {
  slug: string;
  service: PublicService;
  branchId?: string;
  onPick: (employee: PublicEmployee) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [employees, setEmployees] = useState<PublicEmployee[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEmployees(slug, branchId)
      .then(setEmployees)
      .catch((e) => setError(e?.message ?? t('contact.genericError')));
  }, [slug, branchId, t]);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!employees) return <div className="text-slate-400">{t('loading')}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{t('employee.title')}</h2>
          <p className="text-sm text-slate-500 mt-1">
            {t('employee.forService')}{' '}
            <span className="font-medium text-slate-700">{service.name}</span>
          </p>
        </div>
        <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-900">
          {t('common.back')}
        </button>
      </div>

      {employees.length === 0 ? (
        <div className="text-slate-500 text-center py-8">{t('employee.none')}</div>
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
