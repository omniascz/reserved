'use client';

// Vertikála Restaurace — interaktivní floor plan (sprint 10.23).
// View: půdorys stolů rozmístěných dle pozice, barva dle obsazenosti.
// Edit: drag stolů (ukládá pozici), přidání/mazání stolů.
// Pod tím: rezervace se stavovými akcemi + nová rezervace / walk-in.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  createTable,
  createTableReservation,
  deleteTable,
  getAccessToken,
  getTableOverview,
  listBranches,
  listTableReservations,
  setTableReservationStatus,
  updateTablePosition,
  walkInTableReservation,
  type AdminBranch,
  type TableOverviewItem,
  type TableReservation,
} from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Potvrzeno',
  seated: 'Usazeno',
  completed: 'Dokončeno',
  no_show: 'Nedorazil',
  cancelled: 'Zrušeno',
};
const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-blue-100 text-blue-700',
  seated: 'bg-green-100 text-green-700',
  completed: 'bg-slate-100 text-slate-600',
  no_show: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
};

const CANVAS_H = 460;
const TABLE_W = 84;
const TABLE_H = 64;

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('cs-CZ', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  });
}
function toLocalInputValue(d: Date): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}
/** Fallback pozice pro stoly bez uložené souřadnice (mřížka). */
function fallbackPos(i: number): { x: number; y: number } {
  const perRow = 6;
  return { x: 16 + (i % perRow) * (TABLE_W + 16), y: 16 + Math.floor(i / perRow) * (TABLE_H + 16) };
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export default function RestauracePage() {
  const router = useRouter();
  const [tables, setTables] = useState<TableOverviewItem[]>([]);
  const [reservations, setReservations] = useState<TableReservation[]>([]);
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [at, setAt] = useState<string>(() => toLocalInputValue(new Date()));
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    startsAt: toLocalInputValue(new Date()),
    partySize: 2,
    seatingPref: '',
  });

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const atIso = new Date(at).toISOString();
      const [overview, resv, br] = await Promise.all([
        getTableOverview({ at: atIso }),
        listTableReservations(),
        listBranches(),
      ]);
      // Doplň fallback pozice stolům, které ještě nemají uloženou souřadnici.
      setTables(
        overview.map((t, i) => {
          const fb = fallbackPos(i);
          return { ...t, x: t.x ?? fb.x, y: t.y ?? fb.y };
        }),
      );
      setReservations(resv);
      setBranches(br);
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
  }, [at, router]);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Drag stolů (edit mode) ──────────────────────────────────────────
  function onTablePointerDown(e: React.PointerEvent, t: TableOverviewItem): void {
    if (!editMode) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      id: t.id,
      dx: e.clientX - (rect.left + (t.x ?? 0)),
      dy: e.clientY - (rect.top + (t.y ?? 0)),
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onCanvasPointerMove(e: React.PointerEvent): void {
    const drag = dragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const x = clamp(e.clientX - rect.left - drag.dx, 0, rect.width - TABLE_W);
    const y = clamp(e.clientY - rect.top - drag.dy, 0, CANVAS_H - TABLE_H);
    setTables((prev) => prev.map((t) => (t.id === drag.id ? { ...t, x, y } : t)));
  }
  async function onCanvasPointerUp(): Promise<void> {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const t = tables.find((x) => x.id === drag.id);
    if (!t || t.x == null || t.y == null) return;
    try {
      await updateTablePosition(t.id, Math.round(t.x), Math.round(t.y));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se uložit pozici.');
    }
  }

  async function handleAddTable(): Promise<void> {
    const branchId = branches[0]?.id;
    if (!branchId) {
      setError('Nejdřív vytvoř pobočku.');
      return;
    }
    const name = prompt('Název stolu (např. „Stůl 7“):');
    if (!name) return;
    const seats = Number(prompt('Počet míst:', '4'));
    if (!seats || seats < 1) return;
    try {
      await createTable({ branchId, name, seats, x: 320, y: 200, shape: 'square' });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba při vytváření stolu.');
    }
  }

  async function handleDeleteTable(id: string, name: string): Promise<void> {
    if (!confirm(`Smazat stůl „${name}“?`)) return;
    try {
      await deleteTable(id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba při mazání.');
    }
  }

  async function handleAction(
    id: string,
    action: 'seat' | 'complete' | 'no-show' | 'cancel',
  ): Promise<void> {
    try {
      await setTableReservationStatus(id, action);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  async function handleWalkIn(): Promise<void> {
    const partySize = Number(prompt('Počet hostů?', '2'));
    if (!partySize || partySize < 1) return;
    try {
      await walkInTableReservation({ partySize });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se usadit walk-in (volný stůl?).');
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await createTableReservation({
        customerName: form.customerName,
        customerPhone: form.customerPhone || undefined,
        startsAt: new Date(form.startsAt).toISOString(),
        partySize: form.partySize,
        seatingPref: form.seatingPref || undefined,
      });
      setShowForm(false);
      setForm({ ...form, customerName: '', customerPhone: '' });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    }
  }

  const freeCount = tables.filter((t) => t.status === 'free').length;

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Restaurace — půdorys</h2>
            <p className="text-sm text-slate-500">
              Zelená = volno, červená = obsazeno. V režimu úprav přetáhni stoly a ulož rozmístění.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditMode(!editMode)}
              className={`font-semibold px-4 py-2 rounded-lg ${
                editMode
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-slate-200 hover:bg-slate-300'
              }`}
            >
              {editMode ? 'Hotovo' : 'Upravit půdorys'}
            </button>
            {!editMode && (
              <>
                <button
                  onClick={handleWalkIn}
                  className="bg-slate-200 hover:bg-slate-300 font-semibold px-4 py-2 rounded-lg"
                >
                  Walk-in
                </button>
                <button
                  onClick={() => setShowForm(!showForm)}
                  className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
                >
                  {showForm ? 'Zavřít' : '+ Rezervace'}
                </button>
              </>
            )}
            {editMode && (
              <button
                onClick={handleAddTable}
                className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg"
              >
                + Stůl
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}

        {showForm && !editMode && (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 grid sm:grid-cols-2 gap-4"
          >
            <div>
              <label className="block text-sm font-medium mb-1">Jméno hosta</label>
              <input
                type="text"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Telefon</label>
              <input
                type="tel"
                value={form.customerPhone}
                onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Příchod</label>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Počet hostů</label>
              <input
                type="number"
                min={1}
                max={100}
                value={form.partySize}
                onChange={(e) => setForm({ ...form, partySize: Number(e.target.value) })}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Preference posazení</label>
              <select
                value={form.seatingPref}
                onChange={(e) => setForm({ ...form, seatingPref: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="">Bez preference</option>
                <option value="indoor">Uvnitř</option>
                <option value="terrace">Terasa</option>
                <option value="bar">Bar</option>
                <option value="quiet">Klidná část</option>
                <option value="window">U okna</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded font-medium"
              >
                Zrušit
              </button>
              <button
                type="submit"
                className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded font-medium"
              >
                Rezervovat (systém přiřadí stůl)
              </button>
            </div>
          </form>
        )}

        {/* Půdorys */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">
              Stoly{' '}
              <span className="text-sm font-normal text-slate-500">
                ({freeCount} volných z {tables.length})
              </span>
            </h3>
            {!editMode && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">Stav k:</span>
                <input
                  type="datetime-local"
                  value={at}
                  onChange={(e) => setAt(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded"
                />
              </label>
            )}
          </div>

          <div
            ref={canvasRef}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            className={`relative rounded-lg border-2 border-dashed ${
              editMode ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-slate-50'
            }`}
            style={{ height: CANVAS_H }}
          >
            {loading && (
              <p className="absolute inset-0 flex items-center justify-center text-slate-500">
                Načítám…
              </p>
            )}
            {!loading && tables.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-slate-500 text-center px-4">
                Žádné stoly.{' '}
                {editMode
                  ? 'Přidej stůl tlačítkem „+ Stůl“.'
                  : 'Zapni „Upravit půdorys“ a přidej stoly.'}
              </p>
            )}
            {tables.map((t) => {
              const occupied = t.status === 'occupied';
              const round = t.shape === 'round';
              return (
                <div
                  key={t.id}
                  onPointerDown={(e) => onTablePointerDown(e, t)}
                  className={`absolute flex flex-col items-center justify-center border-2 text-center select-none ${
                    round ? 'rounded-full' : 'rounded-lg'
                  } ${
                    occupied ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'
                  } ${editMode ? 'cursor-move shadow-md' : ''}`}
                  style={{ left: t.x ?? 0, top: t.y ?? 0, width: TABLE_W, height: TABLE_H }}
                  title={occupied ? `Obsazeno do ${fmtTime(t.freeAt)}` : 'Volno'}
                >
                  {editMode && (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleDeleteTable(t.id, t.name)}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-600 text-white text-xs leading-none"
                      aria-label="Smazat stůl"
                    >
                      ×
                    </button>
                  )}
                  <span className="font-semibold text-xs text-slate-900">{t.name}</span>
                  <span className="text-[10px] text-slate-500">{t.seats} míst</span>
                  {!editMode && (
                    <span
                      className={`text-[10px] font-medium ${occupied ? 'text-red-700' : 'text-green-700'}`}
                    >
                      {occupied ? `do ${fmtTime(t.freeAt)}` : 'volno'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {editMode && (
            <p className="text-xs text-slate-500 mt-2">
              Přetáhni stůl na místo — pozice se uloží automaticky. Křížkem stůl smažeš.
            </p>
          )}
        </div>

        {/* Rezervace */}
        {!editMode && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <h3 className="font-semibold px-4 py-3 border-b border-slate-200">Rezervace</h3>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Čas</th>
                  <th className="text-left px-4 py-3 font-semibold">Host</th>
                  <th className="text-left px-4 py-3 font-semibold">Osob</th>
                  <th className="text-left px-4 py-3 font-semibold">Stav</th>
                  <th className="text-right px-4 py-3 font-semibold">Akce</th>
                </tr>
              </thead>
              <tbody>
                {!loading && reservations.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-slate-500">
                      Žádné rezervace.
                    </td>
                  </tr>
                )}
                {reservations.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">{fmtTime(r.startsAt)}</td>
                    <td className="px-4 py-3">
                      {r.customerName}
                      {r.customerPhone && (
                        <span className="text-slate-400"> · {r.customerPhone}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{r.partySize}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          STATUS_STYLES[r.status] ?? 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {r.status === 'confirmed' && (
                        <>
                          <button
                            onClick={() => handleAction(r.id, 'seat')}
                            className="text-green-700 hover:text-green-900 mr-3"
                          >
                            Usadit
                          </button>
                          <button
                            onClick={() => handleAction(r.id, 'no-show')}
                            className="text-amber-700 hover:text-amber-900 mr-3"
                          >
                            Nedorazil
                          </button>
                        </>
                      )}
                      {r.status === 'seated' && (
                        <button
                          onClick={() => handleAction(r.id, 'complete')}
                          className="text-slate-700 hover:text-slate-900 mr-3"
                        >
                          Dokončit
                        </button>
                      )}
                      {(r.status === 'confirmed' || r.status === 'seated') && (
                        <button
                          onClick={() => handleAction(r.id, 'cancel')}
                          className="text-red-600 hover:text-red-800"
                        >
                          Zrušit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
