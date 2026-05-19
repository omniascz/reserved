'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AdminApiError,
  createService,
  createEmployee,
  getAccessToken,
  getOnboardingChecklist,
  getTenantSlug,
  markOnboardingStep,
  type OnboardingChecklist,
} from '@/lib/api';

// Smart defaults per business type — preset prvni sluzby + dalsi sluzby
const SERVICE_TEMPLATES: Record<
  string,
  Array<{ name: string; durationMinutes: number; priceHellers: number }>
> = {
  kadernictvi: [
    { name: 'Střih dámský', durationMinutes: 60, priceHellers: 50000 },
    { name: 'Střih pánský', durationMinutes: 30, priceHellers: 30000 },
    { name: 'Foukaná', durationMinutes: 45, priceHellers: 35000 },
    { name: 'Barvení', durationMinutes: 120, priceHellers: 150000 },
  ],
  kosmetika: [
    { name: 'Kosmetické ošetření', durationMinutes: 60, priceHellers: 80000 },
    { name: 'Manikúra', durationMinutes: 45, priceHellers: 50000 },
    { name: 'Pedikúra', durationMinutes: 60, priceHellers: 70000 },
  ],
  masaze: [
    { name: 'Relaxační masáž 60min', durationMinutes: 60, priceHellers: 70000 },
    { name: 'Sportovní masáž 90min', durationMinutes: 90, priceHellers: 100000 },
  ],
  fyzioterapie: [
    { name: 'Vstupní vyšetření', durationMinutes: 60, priceHellers: 100000 },
    { name: 'Terapie 30min', durationMinutes: 30, priceHellers: 60000 },
    { name: 'Terapie 60min', durationMinutes: 60, priceHellers: 100000 },
  ],
  fitness: [
    { name: 'Personal training 60min', durationMinutes: 60, priceHellers: 80000 },
    { name: 'Konzultace', durationMinutes: 30, priceHellers: 40000 },
  ],
  joga: [
    { name: 'Skupinová lekce 60min', durationMinutes: 60, priceHellers: 25000 },
    { name: 'Privátní lekce', durationMinutes: 60, priceHellers: 80000 },
  ],
  lekarska_ordinace: [
    { name: 'Vstupní konzultace', durationMinutes: 30, priceHellers: 0 },
    { name: 'Kontrola', durationMinutes: 15, priceHellers: 0 },
  ],
  psychologie: [
    { name: 'Terapeutické sezení 50min', durationMinutes: 50, priceHellers: 120000 },
    { name: 'První konzultace', durationMinutes: 60, priceHellers: 100000 },
  ],
  koucink: [
    { name: 'Koučovací sezení 60min', durationMinutes: 60, priceHellers: 200000 },
    { name: 'Discovery call 30min', durationMinutes: 30, priceHellers: 0 },
  ],
  autoskola: [
    { name: 'Jízda 90min', durationMinutes: 90, priceHellers: 80000 },
    { name: 'Teorie 90min', durationMinutes: 90, priceHellers: 50000 },
  ],
  other: [{ name: 'Konzultace', durationMinutes: 60, priceHellers: 50000 }],
};

const STEPS = [
  { key: 'firstService', label: 'První služba', icon: '✂️' },
  { key: 'workingHours', label: 'Pracovní doba', icon: '🕐' },
  { key: 'team', label: 'Pozvat tým', icon: '👥' },
  { key: 'payments', label: 'Platby', icon: '💳' },
  { key: 'finish', label: 'Hotovo', icon: '🎉' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<StepKey>('firstService');
  const [checklist, setChecklist] = useState<OnboardingChecklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const businessType =
    typeof window !== 'undefined'
      ? (sessionStorage.getItem('onboarding_business_type') ?? 'other')
      : 'other';

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    getOnboardingChecklist()
      .then((c) => {
        setChecklist(c);
        // Pokud je hotovo, redirect do dashboardu
        if (c.completedAt) {
          router.replace('/dashboard');
        }
      })
      .catch((e) => setError(e.message));
  }, [router]);

  function next() {
    const idx = STEPS.findIndex((s) => s.key === currentStep);
    const nxt = STEPS[idx + 1];
    if (nxt) setCurrentStep(nxt.key);
  }

  function back() {
    const idx = STEPS.findIndex((s) => s.key === currentStep);
    const prv = STEPS[idx - 1];
    if (prv) setCurrentStep(prv.key);
  }

  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-slate-50 to-white p-4">
      <div className="max-w-3xl mx-auto pt-8">
        <div className="bg-white rounded-xl shadow-xl overflow-hidden">
          <div className="bg-brand-600 text-white px-8 py-5">
            <h1 className="text-xl font-bold">Vítej v Reserved!</h1>
            <p className="text-brand-100 text-sm mt-1">
              Připravíme tě k práci za 5 minut. Krok {currentIdx + 1} z {STEPS.length}.
            </p>
          </div>

          {/* Steps progress */}
          <div className="px-8 py-4 border-b border-slate-200 flex items-center justify-between">
            {STEPS.map((s, i) => {
              const isPast = i < currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <div key={s.key} className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                      isCurrent
                        ? 'bg-brand-600 text-white'
                        : isPast
                          ? 'bg-green-500 text-white'
                          : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isPast ? '✓' : i + 1}
                  </div>
                  <span
                    className={`ml-2 text-xs ${
                      isCurrent
                        ? 'text-brand-700 font-semibold'
                        : isPast
                          ? 'text-slate-600'
                          : 'text-slate-400'
                    }`}
                  >
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div className={`w-8 h-0.5 mx-2 ${isPast ? 'bg-green-500' : 'bg-slate-200'}`} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-8">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
                {error}
              </div>
            )}

            {currentStep === 'firstService' && (
              <StepFirstService
                businessType={businessType}
                onDone={async () => {
                  await markStepSafe('firstServiceCreated');
                  next();
                }}
                onError={setError}
                busy={busy}
                setBusy={setBusy}
              />
            )}
            {currentStep === 'workingHours' && (
              <StepWorkingHours
                onDone={async () => {
                  await markStepSafe('workingHoursSet');
                  next();
                }}
                onSkip={async () => {
                  await markStepSafe('workingHoursSet');
                  next();
                }}
                onBack={back}
              />
            )}
            {currentStep === 'team' && (
              <StepTeam
                onDone={async (added) => {
                  if (added) await markStepSafe('teamInvited');
                  else await markStepSafe('teamInvited'); // skip = mark as done
                  next();
                }}
                onBack={back}
                onError={setError}
                busy={busy}
                setBusy={setBusy}
              />
            )}
            {currentStep === 'payments' && (
              <StepPayments
                onDone={async () => {
                  await markStepSafe('paymentsConnected');
                  next();
                }}
                onSkip={async () => {
                  await markStepSafe('paymentsConnected');
                  next();
                }}
                onBack={back}
              />
            )}
            {currentStep === 'finish' && <StepFinish slug={getTenantSlug() ?? 'demo'} />}
          </div>
        </div>
      </div>
    </div>
  );

  async function markStepSafe(step: Parameters<typeof markOnboardingStep>[0]) {
    try {
      const updated = await markOnboardingStep(step);
      setChecklist(updated);
    } catch (e) {
      console.warn('Failed to mark onboarding step:', e);
    }
  }
}

// ─── Step 1: První služba ─────────────────────────────────────────────

function StepFirstService({
  businessType,
  onDone,
  onError,
  busy,
  setBusy,
}: {
  businessType: string;
  onDone: () => Promise<void>;
  onError: (msg: string) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const templates: Array<{ name: string; durationMinutes: number; priceHellers: number }> =
    SERVICE_TEMPLATES[businessType] ?? SERVICE_TEMPLATES.other ?? [];
  const first = templates[0] ?? { name: 'Konzultace', durationMinutes: 60, priceHellers: 50000 };
  const [name, setName] = useState(first.name);
  const [duration, setDuration] = useState(first.durationMinutes);
  const [priceKc, setPriceKc] = useState(Math.round(first.priceHellers / 100));

  function useTemplate(idx: number) {
    const t = templates[idx];
    if (!t) return;
    setName(t.name);
    setDuration(t.durationMinutes);
    setPriceKc(Math.round(t.priceHellers / 100));
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    try {
      await createService({
        name,
        durationMinutes: duration,
        priceHellers: priceKc * 100,
        currency: 'CZK',
        capacity: 1,
        isPublic: true,
      });
      await onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Vytvoř první službu</h2>
      <p className="text-slate-600 text-sm mb-6">
        Zákazníci si budou rezervovat termíny na tuto službu. Můžeš ji kdykoliv změnit.
      </p>

      {templates.length > 1 && (
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Šablony:</label>
          <div className="flex flex-wrap gap-2">
            {templates.map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => useTemplate(i)}
                className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-brand-100 hover:text-brand-700 rounded-lg border border-slate-200"
              >
                {t.name} · {t.durationMinutes} min · {t.priceHellers / 100} Kč
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Název služby</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Délka (minuty)</label>
            <input
              type="number"
              min="5"
              max="480"
              step="5"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Cena (Kč)</label>
            <input
              type="number"
              min="0"
              value={priceKc}
              onChange={(e) => setPriceKc(Number(e.target.value))}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50"
        >
          {busy ? 'Vytvářím…' : 'Vytvořit službu a pokračovat →'}
        </button>
      </form>
    </div>
  );
}

// ─── Step 2: Pracovní doba (zjednodušená) ─────────────────────────────

function StepWorkingHours({
  onDone,
  onSkip,
  onBack,
}: {
  onDone: () => Promise<void>;
  onSkip: () => Promise<void>;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Pracovní doba</h2>
      <p className="text-slate-600 text-sm mb-6">
        Kdy je tvůj salon otevřený? Toto nastavení můžeš doladit později v sekci{' '}
        <strong>Zaměstnanci</strong> — každý zaměstnanec může mít vlastní rozvrh.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-blue-900 mb-1">Default: Po-Pá 9:00-18:00</h3>
        <p className="text-sm text-blue-800">
          Začneme s touto pracovní dobou. Pro detailní rozvrh per zaměstnance přejdi do sekce
          „Zaměstnanci" v adminu.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
        >
          ← Zpět
        </button>
        <button
          type="button"
          onClick={() => onDone()}
          className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg"
        >
          Akceptovat default a pokračovat →
        </button>
      </div>

      <button
        type="button"
        onClick={() => onSkip()}
        className="w-full mt-2 text-sm text-slate-500 hover:text-slate-700"
      >
        Přeskočit — nastavím později
      </button>
    </div>
  );
}

// ─── Step 3: Pozvat tým ───────────────────────────────────────────────

function StepTeam({
  onDone,
  onBack,
  onError,
  busy,
  setBusy,
}: {
  onDone: (added: boolean) => Promise<void>;
  onBack: () => void;
  onError: (msg: string) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  async function handleAdd(ev: React.FormEvent) {
    ev.preventDefault();
    if (!firstName || !lastName) {
      onError('Vyplň alespoň jméno a příjmení.');
      return;
    }
    setBusy(true);
    try {
      await createEmployee({
        firstName,
        lastName,
        email: email || null,
        isPublic: true,
        acceptsOnlineBookings: true,
      });
      await onDone(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Tvůj tým</h2>
      <p className="text-slate-600 text-sm mb-6">
        Přidej zaměstnance, kteří budou přijímat rezervace. Můžeš přidat víc lidí později.
      </p>

      <form onSubmit={handleAdd} className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Jméno</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder="Jana"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Příjmení</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder="Nováková"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email (volitelný)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            placeholder="jana@salon.cz"
          />
          <p className="text-xs text-slate-500 mt-1">
            Pokud uvedeš email, dostane pozvánku do systému.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            ← Zpět
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50"
          >
            {busy ? 'Přidávám…' : 'Přidat a pokračovat →'}
          </button>
        </div>
      </form>

      <button
        type="button"
        onClick={() => onDone(false)}
        className="w-full mt-3 text-sm text-slate-500 hover:text-slate-700"
      >
        Přeskočit — pracuji sám/sama
      </button>
    </div>
  );
}

// ─── Step 4: Platby ────────────────────────────────────────────────────

function StepPayments({
  onDone,
  onSkip,
  onBack,
}: {
  onDone: () => Promise<void>;
  onSkip: () => Promise<void>;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Platby od klientů</h2>
      <p className="text-slate-600 text-sm mb-6">
        Klienti můžou platit hotovostí, kartou na terminálu, QR platbou nebo přes Stripe/GoPay
        online. Detailně to nastavíš v <strong>Platby → Metody</strong>.
      </p>

      <div className="space-y-3 mb-6">
        <PaymentOption icon="💵" name="Hotovost" hint="Vždy zapnuto, default" />
        <PaymentOption
          icon="💳"
          name="Platba kartou na terminálu"
          hint="Manuální záznam po platbě"
        />
        <PaymentOption icon="📱" name="QR platba (SPD/IBAN)" hint="Generuje QR z účtu" />
        <PaymentOption icon="🌍" name="Online (Stripe / GoPay)" hint="Vyžaduje API klíče" />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
        >
          ← Zpět
        </button>
        <button
          type="button"
          onClick={() => onDone()}
          className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg"
        >
          Pokračovat →
        </button>
      </div>

      <button
        type="button"
        onClick={() => onSkip()}
        className="w-full mt-2 text-sm text-slate-500 hover:text-slate-700"
      >
        Přeskočit — nastavím později
      </button>
    </div>
  );
}

function PaymentOption({ icon, name, hint }: { icon: string; name: string; hint: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
      <span className="text-2xl">{icon}</span>
      <div className="flex-1">
        <div className="font-medium text-sm">{name}</div>
        <div className="text-xs text-slate-500">{hint}</div>
      </div>
    </div>
  );
}

// ─── Step 5: Hotovo! ───────────────────────────────────────────────────

function StepFinish({ slug }: { slug: string }) {
  const widgetUrl =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//localhost:4004/${slug}/services`
      : '';
  return (
    <div className="text-center">
      <div className="text-6xl mb-4">🎉</div>
      <h2 className="text-2xl font-bold mb-2">Jsi připraven přijímat rezervace!</h2>
      <p className="text-slate-600 mb-6">
        Sdílej odkaz na svůj rezervační widget se svými klienty — můžou si rezervovat kdykoliv,
        24/7.
      </p>

      <div className="bg-brand-50 border-2 border-brand-200 rounded-lg p-4 mb-6">
        <label className="block text-xs font-medium text-brand-700 uppercase tracking-wide mb-1">
          Tvůj rezervační odkaz
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={widgetUrl}
            readOnly
            className="flex-1 px-3 py-2 bg-white border border-brand-300 rounded font-mono text-sm select-all"
          />
          <button
            onClick={() => navigator.clipboard.writeText(widgetUrl)}
            className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded text-sm font-medium"
          >
            Kopírovat
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-6">
        <Link
          href="/dashboard"
          className="bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-lg block"
        >
          Otevřít Dashboard
        </Link>
        <Link
          href="/services"
          className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold py-3 rounded-lg block"
        >
          Spravovat služby
        </Link>
      </div>

      <p className="text-xs text-slate-500">
        Příští kroky: nastav podrobnější pracovní dobu zaměstnanců, přidej víc služeb, nastav
        pravidla pro rezervace.
      </p>
    </div>
  );
}
