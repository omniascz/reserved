'use client';

// Formulář lekce — sdílený pro vypsání nové lekce (/class-sessions) i editaci
// na detailu (/class-sessions/[id]). V režimu editace jsou službu a místa v sále
// zamčené: backend je u PATCH nemění.

import { useState } from 'react';
import type {
  AdminClassSession,
  AdminEmployeeFull,
  AdminResource,
  AdminServiceFull,
} from '@/lib/api';

export interface SessionFormValues {
  serviceId: string;
  employeeId: string;
  resourceId: string;
  startsAtLocal: string;
  capacity: number;
  spotCount: number;
  minAge: string;
  maxAge: string;
  prerequisiteServiceId: string;
}

/** ISO (UTC) → hodnota pro <input type="datetime-local"> v místním čase. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/** Hodnota z <input type="datetime-local"> (místní čas) → ISO v UTC pro API. */
export function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}

export function emptyFormValues(defaultStartsAtLocal: string): SessionFormValues {
  return {
    serviceId: '',
    employeeId: '',
    resourceId: '',
    startsAtLocal: defaultStartsAtLocal,
    capacity: 12,
    spotCount: 0,
    minAge: '',
    maxAge: '',
    prerequisiteServiceId: '',
  };
}

export function sessionToFormValues(session: AdminClassSession): SessionFormValues {
  return {
    serviceId: session.serviceId,
    employeeId: session.employeeId ?? '',
    resourceId: session.resourceId ?? '',
    startsAtLocal: isoToLocalInput(session.startsAt),
    capacity: session.capacity,
    spotCount: session.spotCount,
    minAge: session.minAge == null ? '' : String(session.minAge),
    maxAge: session.maxAge == null ? '' : String(session.maxAge),
    prerequisiteServiceId: session.prerequisiteServiceId ?? '',
  };
}

interface Props {
  mode: 'create' | 'edit';
  values: SessionFormValues;
  services: AdminServiceFull[];
  employees: AdminEmployeeFull[];
  resources: AdminResource[];
  error: string | null;
  onChange: (values: SessionFormValues) => void;
  onSubmit: () => Promise<void> | void;
  onCancel: () => void;
}

export function SessionForm({
  mode,
  values,
  services,
  employees,
  resources,
  error,
  onChange,
  onSubmit,
  onCancel,
}: Props) {
  const [saving, setSaving] = useState(false);
  const machines = resources.filter((r) => r.type !== 'table' && r.isActive);

  async function handleSubmit() {
    setSaving(true);
    try {
      await onSubmit();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-10">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-4">
          {mode === 'edit' ? 'Upravit lekci' : 'Nová lekce'}
        </h3>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Služba *</label>
            <select
              value={values.serviceId}
              disabled={mode === 'edit'}
              onChange={(e) => {
                const svc = services.find((s) => s.id === e.target.value);
                onChange({
                  ...values,
                  serviceId: e.target.value,
                  capacity: svc ? svc.capacity : values.capacity,
                });
              }}
              className="w-full border border-slate-300 rounded px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500"
            >
              <option value="">— vyber službu —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMinutes} min · kapacita {s.capacity}
                </option>
              ))}
            </select>
            {mode === 'edit' && (
              <p className="text-xs text-slate-500 mt-1">
                Službu u vypsané lekce změnit nelze. Zruš lekci a vypiš novou.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Začátek *</label>
            <input
              type="datetime-local"
              value={values.startsAtLocal}
              onChange={(e) => onChange({ ...values, startsAtLocal: e.target.value })}
              className="w-full border border-slate-300 rounded px-3 py-2"
            />
            <p className="text-xs text-slate-500 mt-1">Zadává se v místním čase.</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Kapacita *</label>
            <input
              type="number"
              min="1"
              max="1000"
              value={values.capacity}
              onChange={(e) => onChange({ ...values, capacity: Number(e.target.value) || 1 })}
              className="w-full border border-slate-300 rounded px-3 py-2"
            />
            <p className="text-xs text-slate-500 mt-1">
              Skupinová lekce potřebuje 2 a víc. Kapacitu 1 lze dát jen lekci s přístrojem.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Trenér</label>
            <select
              value={values.employeeId}
              onChange={(e) => onChange({ ...values, employeeId: e.target.value })}
              className="w-full border border-slate-300 rounded px-3 py-2"
            >
              <option value="">— bez trenéra —</option>
              {employees
                .filter((e) => e.isActive)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.displayName ?? `${e.firstName} ${e.lastName}`}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Přístroj (EMS)</label>
            <select
              value={values.resourceId}
              onChange={(e) => onChange({ ...values, resourceId: e.target.value })}
              className="w-full border border-slate-300 rounded px-3 py-2"
            >
              <option value="">— bez přístroje —</option>
              {machines.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Míst v sále</label>
            <input
              type="number"
              min="0"
              max="1000"
              value={values.spotCount}
              disabled={mode === 'edit'}
              onChange={(e) => onChange({ ...values, spotCount: Number(e.target.value) || 0 })}
              className="w-full border border-slate-300 rounded px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              0 = klient si místo nevybírá{mode === 'edit' ? '. U vypsané lekce nelze měnit.' : '.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">Věk od</label>
              <input
                type="number"
                min="0"
                max="120"
                value={values.minAge}
                onChange={(e) => onChange({ ...values, minAge: e.target.value })}
                className="w-full border border-slate-300 rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Věk do</label>
              <input
                type="number"
                min="0"
                max="120"
                value={values.maxAge}
                onChange={(e) => onChange({ ...values, maxAge: e.target.value })}
                className="w-full border border-slate-300 rounded px-3 py-2"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">
              Prerekvizita (klient musí mít dokončenou službu)
            </label>
            <select
              value={values.prerequisiteServiceId}
              onChange={(e) => onChange({ ...values, prerequisiteServiceId: e.target.value })}
              className="w-full border border-slate-300 rounded px-3 py-2"
            >
              <option value="">— žádná —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-slate-300 rounded font-medium hover:bg-slate-50"
          >
            Zrušit
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded font-medium disabled:opacity-50"
          >
            {saving ? 'Ukládám…' : 'Uložit'}
          </button>
        </div>
      </div>
    </div>
  );
}
