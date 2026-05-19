'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  getAccessToken,
  getBookingRules,
  getNotificationSettings,
  updateBookingRules,
  updateNotificationSettings,
  type BookingRules,
  type NotificationSettings,
} from '@/lib/api';

export default function SettingsPage() {
  const router = useRouter();
  const [rules, setRules] = useState<BookingRules | null>(null);
  const [notif, setNotif] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  useEffect(() => {
    Promise.all([getBookingRules(), getNotificationSettings()])
      .then(([r, n]) => {
        setRules(r);
        setNotif(n);
      })
      .catch((e) => {
        if (e instanceof AdminApiError && e.status === 401) {
          clearAuth();
          router.replace('/login');
        } else {
          setError(e?.message ?? 'Chyba');
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!rules || !notif) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const [updatedRules, updatedNotif] = await Promise.all([
        updateBookingRules(rules),
        updateNotificationSettings(notif),
      ]);
      setRules(updatedRules);
      setNotif(updatedNotif);
      setSuccess('Uloženo.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <NavHeader />
        <main className="flex-1 p-6 text-slate-400">Načítám…</main>
      </div>
    );
  }

  if (!rules || !notif) {
    return (
      <div className="min-h-screen flex flex-col">
        <NavHeader />
        <main className="flex-1 p-6 text-red-600">{error ?? 'Nelze načíst nastavení.'}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <NavHeader />
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <h2 className="text-2xl font-bold mb-2">Nastavení rezervací</h2>
        <p className="text-sm text-slate-500 mb-6">
          Tato pravidla se uplatňují všude — ve widgetu i v adminu. Změnu okamžitě vidí zákazníci.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3 rounded mb-4">
            {success}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          <Card title="Časové okno rezervace">
            <Field
              label="Jak daleko dopředu se dá rezervovat"
              suffix="dní"
              help="Maximální vzdálenost termínu od dnešního dne. Default 60 dní."
            >
              <input
                type="number"
                min="1"
                max="365"
                value={rules.maxDaysAhead}
                onChange={(e) => setRules({ ...rules, maxDaysAhead: Number(e.target.value) || 60 })}
                className="w-32 px-3 py-2 border border-slate-300 rounded-lg"
              />
            </Field>
            <Field
              label="Nejpozdější rezervace"
              suffix="hodin před lekcí"
              help="Nejpozději kolik hodin před lekcí se ještě dá rezervovat. Default 2h."
            >
              <input
                type="number"
                min="0"
                max="168"
                step="0.5"
                value={rules.minHoursBefore}
                onChange={(e) =>
                  setRules({ ...rules, minHoursBefore: Number(e.target.value) || 0 })
                }
                className="w-32 px-3 py-2 border border-slate-300 rounded-lg"
              />
            </Field>
            <Field
              label="Slot interval"
              suffix="minut"
              help="Krok mezi nabízenými časy ve widgetu. Default 15 min."
            >
              <input
                type="number"
                min="5"
                max="60"
                step="5"
                value={rules.slotIntervalMinutes}
                onChange={(e) =>
                  setRules({ ...rules, slotIntervalMinutes: Number(e.target.value) || 15 })
                }
                className="w-32 px-3 py-2 border border-slate-300 rounded-lg"
              />
            </Field>
          </Card>

          <Card title="Storno a přesun">
            <Field
              label="Storno bez poplatku — minimálně"
              suffix="hodin před lekcí"
              help="Pokud klient zruší později, podle Rules Engine (sprint 2.5) se může strhnout poplatek."
            >
              <input
                type="number"
                min="0"
                max="168"
                step="0.5"
                value={rules.stornoLimitHours}
                onChange={(e) =>
                  setRules({ ...rules, stornoLimitHours: Number(e.target.value) || 0 })
                }
                className="w-32 px-3 py-2 border border-slate-300 rounded-lg"
              />
            </Field>
            <Field
              label="Přesun lekce — minimálně"
              suffix="hodin před lekcí"
              help="Po této hranici klient musí volat ručně."
            >
              <input
                type="number"
                min="0"
                max="168"
                step="0.5"
                value={rules.presunLimitHours}
                onChange={(e) =>
                  setRules({ ...rules, presunLimitHours: Number(e.target.value) || 0 })
                }
                className="w-32 px-3 py-2 border border-slate-300 rounded-lg"
              />
            </Field>
          </Card>

          <Card title="Připomínky před rezervací">
            <Field
              label="Kolik hodin před začátkem poslat připomínku"
              suffix="hodin (0 = vypnuto)"
              help="Worker automaticky pošle email připomínku. Pokud je SMS zapnutá a klient má telefon, pošle se i SMS."
            >
              <input
                type="number"
                min="0"
                max="168"
                value={notif.reminderHoursBefore}
                onChange={(e) =>
                  setNotif({ ...notif, reminderHoursBefore: Number(e.target.value) || 0 })
                }
                className="w-32 px-3 py-2 border border-slate-300 rounded-lg"
              />
            </Field>
            <div>
              <label className="block text-sm font-medium mb-1">Primární kanál</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="primaryChannel"
                    checked={notif.primaryChannel === 'email'}
                    onChange={() => setNotif({ ...notif, primaryChannel: 'email' })}
                  />
                  <span>E-mail</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="primaryChannel"
                    checked={notif.primaryChannel === 'sms'}
                    onChange={() => setNotif({ ...notif, primaryChannel: 'sms' })}
                  />
                  <span>SMS (vyžaduje telefon u klienta)</span>
                </label>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Pokud zvolíš SMS jako primární a klient nemá telefon, pošle se email jako záloha.
              </p>
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notif.smsEnabled}
                  onChange={(e) => setNotif({ ...notif, smsEnabled: e.target.checked })}
                />
                <span className="text-sm font-medium">Posílat i SMS připomínku</span>
              </label>
              <p className="text-xs text-slate-500 mt-1 ml-6">
                Pokud zapneš, dostane klient kromě e-mailu i SMS — když má telefon v profilu. SMS
                stojí navíc (~1 Kč/zpráva).
              </p>
            </div>
          </Card>

          <button
            type="submit"
            disabled={saving}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 rounded-lg disabled:opacity-50"
          >
            {saving ? 'Ukládám…' : 'Uložit změny'}
          </button>
        </form>
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h3 className="font-semibold text-lg mb-4">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  suffix,
  help,
  children,
}: {
  label: string;
  suffix: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className="flex items-center gap-3">
        {children}
        <span className="text-sm text-slate-500">{suffix}</span>
      </div>
      <p className="text-xs text-slate-500 mt-1">{help}</p>
    </div>
  );
}
