'use client';

// Sprint 9.1-C: Rozšířený onboarding widget.
// Krome DB-tracked checklistu zobrazi i "doporucene dalsi kroky" (vzhled, embed, mini-web).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getOnboardingChecklist,
  markOnboardingStep,
  type OnboardingChecklist,
  type OnboardingStep,
} from '@/lib/api';

const CORE_ITEMS: Array<{ key: OnboardingStep; label: string; link?: string }> = [
  { key: 'emailVerified', label: 'Ověřit email', link: undefined },
  { key: 'firstServiceCreated', label: 'Vytvořit první službu', link: '/services' },
  { key: 'workingHoursSet', label: 'Nastavit pracovní dobu', link: '/employees' },
  { key: 'teamInvited', label: 'Pozvat tým', link: '/employees' },
  { key: 'paymentsConnected', label: 'Nastavit platby', link: '/payments/methods' },
  { key: 'firstBookingReceived', label: 'První rezervace', link: '/calendar' },
];

const NEXT_STEPS: Array<{
  icon: string;
  label: string;
  link: string;
  description: string;
  storageKey: string;
}> = [
  {
    icon: '🎨',
    label: 'Nastav vzhled widgetu',
    link: '/settings/theme',
    description: 'Barva, font, logo — klienti uvidí Tvůj brand.',
    storageKey: 'onboarding_theme_seen',
  },
  {
    icon: '🔗',
    label: 'Sdílej rezervační odkaz / vlož na svůj web',
    link: '/settings/embed',
    description: 'Zkopíruj 1-řádkový kód do Wordpressu, Wixu, vlastního webu.',
    storageKey: 'onboarding_embed_seen',
  },
  {
    icon: '🌐',
    label: 'Vytvoř si vlastní mini-web',
    link: '/settings/site',
    description: 'Pokud ještě nemáš web, dáme ti ho zdarma na vlastní doméně.',
    storageKey: 'onboarding_site_seen',
  },
];

export function OnboardingWidget() {
  const [checklist, setChecklist] = useState<OnboardingChecklist | null>(null);
  const [hidden, setHidden] = useState(false);
  const [seenExtras, setSeenExtras] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getOnboardingChecklist()
      .then(setChecklist)
      .catch(() => undefined);

    // Načti localStorage flags pro extras
    if (typeof window !== 'undefined') {
      const seen: Record<string, boolean> = {};
      for (const step of NEXT_STEPS) {
        seen[step.storageKey] = localStorage.getItem(step.storageKey) === '1';
      }
      setSeenExtras(seen);
    }
  }, []);

  if (!checklist || hidden) return null;

  async function handleSkip(step: OnboardingStep): Promise<void> {
    try {
      const updated = await markOnboardingStep(step);
      setChecklist(updated);
    } catch {
      // tichý fail
    }
  }

  function markExtraSeen(key: string): void {
    localStorage.setItem(key, '1');
    setSeenExtras({ ...seenExtras, [key]: true });
  }

  const coreCompleted = !!checklist.completedAt;
  const allExtrasSeen = NEXT_STEPS.every((s) => seenExtras[s.storageKey]);

  // Pokud je vše hotovo (core + extras), schovej widget
  if (coreCompleted && allExtrasSeen) return null;

  return (
    <section className="bg-gradient-to-r from-brand-50 to-blue-50 border-2 border-brand-200 rounded-xl p-5 mb-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-brand-900">
            {coreCompleted
              ? '🎉 Setup hotový — doporučujeme dalších pár kroků'
              : `🚀 Začínáme — ${checklist.completedCount} z ${checklist.totalCount} kroků hotových`}
          </h3>
          <p className="text-sm text-brand-700 mt-0.5">
            {coreCompleted
              ? 'Tvůj salon je nastavený. Teď ukaž ho světu.'
              : 'Dokonči setup salonu, ať můžeš začít přijímat rezervace.'}
          </p>
        </div>
        <button
          onClick={() => setHidden(true)}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Skrýt
        </button>
      </div>

      {/* Progress bar — jen pro core */}
      {!coreCompleted && (
        <div className="w-full bg-white rounded-full h-2 mb-4">
          <div
            className="bg-brand-600 h-2 rounded-full transition-all"
            style={{ width: `${checklist.progressPercent}%` }}
          />
        </div>
      )}

      {/* Core checklist — zobrazí se vždy, dokud není 100 % */}
      {!coreCompleted && (
        <ul className="space-y-1.5 mb-4">
          {CORE_ITEMS.map((item) => {
            const done = checklist[item.key];
            return (
              <li
                key={item.key}
                className={`flex items-center justify-between text-sm py-1 ${
                  done ? 'text-slate-500' : 'text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      done ? 'bg-green-500 text-white' : 'bg-white border-2 border-slate-300'
                    }`}
                  >
                    {done ? '✓' : ''}
                  </span>
                  {item.link && !done ? (
                    <Link href={item.link} className="hover:text-brand-700 hover:underline">
                      {item.label}
                    </Link>
                  ) : (
                    <span className={done ? 'line-through' : ''}>{item.label}</span>
                  )}
                </div>
                {!done && (
                  <button
                    onClick={() => handleSkip(item.key)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Přeskočit
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Doporučené další kroky — zobrazí se vždy */}
      <div className={coreCompleted ? '' : 'pt-3 mt-3 border-t border-brand-200'}>
        {!coreCompleted && (
          <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-2">
            ✨ Doporučené dál (po dokončení výše)
          </h4>
        )}
        <div className="space-y-2">
          {NEXT_STEPS.map((step) => {
            const seen = seenExtras[step.storageKey];
            return (
              <div
                key={step.link}
                className={`flex items-start justify-between gap-3 bg-white rounded-lg p-3 border ${
                  seen ? 'border-slate-200 opacity-60' : 'border-brand-200'
                }`}
              >
                <Link
                  href={step.link}
                  onClick={() => markExtraSeen(step.storageKey)}
                  className="flex items-start gap-3 flex-1 hover:text-brand-700"
                >
                  <span className="text-2xl">{step.icon}</span>
                  <div>
                    <div className="font-semibold text-sm">{step.label}</div>
                    <p className="text-xs text-slate-600 mt-0.5">{step.description}</p>
                  </div>
                </Link>
                {!seen && (
                  <button
                    onClick={() => markExtraSeen(step.storageKey)}
                    className="text-xs text-slate-400 hover:text-slate-600 whitespace-nowrap"
                  >
                    Přeskočit
                  </button>
                )}
                {seen && <span className="text-green-600 text-xl">✓</span>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
