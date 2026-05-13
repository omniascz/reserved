'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createCreditPack,
  deleteCreditPack,
  getAccessToken,
  listBranches,
  listCreditPacks,
  listServices,
  updateCreditPack,
  type AdminBranch,
  type AdminCreditPack,
  type AdminService,
} from '@/lib/api';

interface FormState {
  id: string | null;
  name: string;
  description: string;
  mode: 'per_visit' | 'per_credit';
  totalCredits: number;
  validityDays: number | null;
  priceHellers: number;
  allowedServiceIds: string[];
  allowedBranchIds: string[];
  creditCostsByService: Record<string, number>;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  description: '',
  mode: 'per_visit',
  totalCredits: 10,
  validityDays: 180,
  priceHellers: 300000,
  allowedServiceIds: [],
  allowedBranchIds: [],
  creditCostsByService: {},
  isActive: true,
};

export default function CreditPacksPage() {
  const router = useRouter();
  const [packs, setPacks] = useState<AdminCreditPack[]>([]);
  const [services, setServices] = useState<AdminService[]>([]);
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FormState | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s, b] = await Promise.all([listCreditPacks(), listServices(), listBranches()]);
      setPacks(p);
      setServices(s);
      setBranches(b);
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 401) {
        clearAuth();
        router.replace('/login');
      } else {
        setError(e instanceof Error ? e.message : 'Chyba');
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    reload();
  }, [reload]);

  function startNew() {
    setEditing({ ...EMPTY_FORM });
  }

  function startEdit(p: AdminCreditPack) {
    setEditing({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      mode: p.mode,
      totalCredits: p.totalCredits,
      validityDays: p.validityDays,
      priceHellers: p.priceHellers,
      allowedServiceIds: p.allowedServiceIds,
      allowedBranchIds: p.allowedBranchIds,
      creditCostsByService: p.creditCostsByService,
      isActive: p.isActive,
    });
  }

  async function handleSave() {
    if (!editing) return;
    setError(null);
    try {
      const payload = {
        name: editing.name,
        description: editing.description || undefined,
        mode: editing.mode,
        totalCredits: editing.totalCredits,
        validityDays: editing.validityDays,
        priceHellers: editing.priceHellers,
        allowedServiceIds: editing.allowedServiceIds,
        allowedBranchIds: editing.allowedBranchIds,
        creditCostsByService: editing.mode === 'per_credit' ? editing.creditCostsByService : {},
        isActive: editing.isActive,
      };
      if (editing.id) {
        await updateCreditPack(editing.id, payload);
      } else {
        await createCreditPack(payload);
      }
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleDelete(p: AdminCreditPack) {
    if (!confirm(`Smazat šablonu "${p.name}"? Existující prodané balíčky zůstanou.`)) return;
    try {
      await deleteCreditPack(p.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Permanentky</h2>
            <p className="text-sm text-slate-500">
              Šablony balíčků („10× EMS za 3000 Kč", „5× kosmetika za 2500 Kč"…). Konkrétnímu
              zákazníkovi pak permanentku prodáš v jeho detailu (záložka Permanentky).
            </p>
          </div>
          <button
            onClick={startNew}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            + Nová šablona
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {editing && (
          <CreditPackForm
            form={editing}
            services={services}
            branches={branches}
            onChange={setEditing}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-4">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Název</th>
                <th className="text-left px-4 py-3 font-semibold">Režim</th>
                <th className="text-center px-4 py-3 font-semibold">Kreditů</th>
                <th className="text-center px-4 py-3 font-semibold">Platnost</th>
                <th className="text-right px-4 py-3 font-semibold">Cena</th>
                <th className="text-center px-4 py-3 font-semibold">Aktivní</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && packs.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    Žádné šablony. Vytvoř první („10× lekce za 3000 Kč" je dobrá první volba).
                  </td>
                </tr>
              )}
              {packs.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    {p.description && <div className="text-xs text-slate-500">{p.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.mode === 'per_visit' ? 'Návštěva = 1' : 'Variabilní'}
                  </td>
                  <td className="px-4 py-3 text-center">{p.totalCredits}</td>
                  <td className="px-4 py-3 text-center text-slate-600">
                    {p.validityDays ? `${p.validityDays} dní` : 'bez expirace'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(p.priceHellers / 100).toLocaleString('cs-CZ')} {p.currency}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.isActive ? (
                      <span className="text-emerald-600">✓</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => startEdit(p)}
                      className="text-brand-600 hover:text-brand-800 text-sm mr-3"
                    >
                      Upravit
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      className="text-red-600 hover:text-red-800"
                      aria-label="Smazat"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function CreditPackForm({
  form,
  services,
  branches,
  onChange,
  onSave,
  onCancel,
}: {
  form: FormState;
  services: AdminService[];
  branches: AdminBranch[];
  onChange: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  function toggleService(id: string) {
    const next = form.allowedServiceIds.includes(id)
      ? form.allowedServiceIds.filter((s) => s !== id)
      : [...form.allowedServiceIds, id];
    onChange({ ...form, allowedServiceIds: next });
  }
  function toggleBranch(id: string) {
    const next = form.allowedBranchIds.includes(id)
      ? form.allowedBranchIds.filter((b) => b !== id)
      : [...form.allowedBranchIds, id];
    onChange({ ...form, allowedBranchIds: next });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4 mb-4"
    >
      <h3 className="font-semibold">{form.id ? 'Upravit šablonu' : 'Nová šablona permanentky'}</h3>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Název *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            required
            placeholder="10× EMS trénink"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Cena (Kč)</label>
          <input
            type="number"
            value={form.priceHellers / 100}
            onChange={(e) =>
              onChange({ ...form, priceHellers: Math.round(Number(e.target.value) * 100) })
            }
            min={0}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Popis</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            placeholder="Pro zákazníka — co balíček obsahuje, kdy platí…"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Režim</label>
          <select
            value={form.mode}
            onChange={(e) =>
              onChange({ ...form, mode: e.target.value as 'per_visit' | 'per_credit' })
            }
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          >
            <option value="per_visit">1 návštěva = 1 kredit</option>
            <option value="per_credit">Variabilní (cena dle služby)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Počet kreditů</label>
          <input
            type="number"
            value={form.totalCredits}
            onChange={(e) => onChange({ ...form, totalCredits: Number(e.target.value) || 1 })}
            min={1}
            max={1000}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Platnost (dní)</label>
          <input
            type="number"
            value={form.validityDays ?? ''}
            onChange={(e) =>
              onChange({
                ...form,
                validityDays: e.target.value ? Number(e.target.value) : null,
              })
            }
            placeholder="prázdné = bez expirace"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Pro které služby? (žádná zaškrtnutá = všechny)
        </label>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <label
              key={s.id}
              className={`cursor-pointer text-sm px-3 py-1 rounded-full border ${
                form.allowedServiceIds.includes(s.id)
                  ? 'bg-brand-100 border-brand-400 text-brand-800'
                  : 'bg-white border-slate-300 text-slate-600'
              }`}
            >
              <input
                type="checkbox"
                checked={form.allowedServiceIds.includes(s.id)}
                onChange={() => toggleService(s.id)}
                className="hidden"
              />
              {s.name}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Pro které pobočky? (žádná = všechny)
        </label>
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <label
              key={b.id}
              className={`cursor-pointer text-sm px-3 py-1 rounded-full border ${
                form.allowedBranchIds.includes(b.id)
                  ? 'bg-brand-100 border-brand-400 text-brand-800'
                  : 'bg-white border-slate-300 text-slate-600'
              }`}
            >
              <input
                type="checkbox"
                checked={form.allowedBranchIds.includes(b.id)}
                onChange={() => toggleBranch(b.id)}
                className="hidden"
              />
              {b.name}
            </label>
          ))}
        </div>
      </div>

      {form.mode === 'per_credit' && (
        <div>
          <label className="block text-sm font-medium mb-1">Kreditní cena za službu</label>
          <p className="text-xs text-slate-500 mb-2">
            Default 1. Nastav vyšší pro delší/dražší služby.
          </p>
          <div className="space-y-1">
            {services
              .filter(
                (s) => form.allowedServiceIds.length === 0 || form.allowedServiceIds.includes(s.id),
              )
              .map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="flex-1 text-sm">{s.name}</span>
                  <input
                    type="number"
                    value={form.creditCostsByService[s.id] ?? 1}
                    onChange={(e) =>
                      onChange({
                        ...form,
                        creditCostsByService: {
                          ...form.creditCostsByService,
                          [s.id]: Number(e.target.value) || 1,
                        },
                      })
                    }
                    min={1}
                    max={50}
                    className="w-20 px-2 py-1 border border-slate-300 rounded text-sm text-right"
                  />
                  <span className="text-xs text-slate-500">kreditů</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => onChange({ ...form, isActive: e.target.checked })}
        />
        <span className="text-sm">Šablona aktivní (lze prodávat)</span>
      </label>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded font-medium"
        >
          Zrušit
        </button>
        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded font-medium"
        >
          {form.id ? 'Uložit' : 'Vytvořit'}
        </button>
      </div>
    </form>
  );
}
