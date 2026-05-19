'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getOnboardingChecklist,
  markOnboardingStep,
  type OnboardingChecklist,
  type OnboardingStep,
} from '@/lib/api';

const ITEMS: Array<{ key: OnboardingStep; label: string; link?: string }> = [
  { key: 'emailVerified', label: 'Ověřit email', link: undefined },
  { key: 'firstServiceCreated', label: 'Vytvořit první službu', link: '/services' },
  { key: 'workingHoursSet', label: 'Nastavit pracovní dobu', link: '/employees' },
  { key: 'teamInvited', label: 'Pozvat tým', link: '/employees' },
  { key: 'paymentsConnected', label: 'Nastavit platby', link: '/payments/methods' },
  { key: 'firstBookingReceived', label: 'První rezervace', link: '/calendar' },
];

export function OnboardingWidget() {
  const [checklist, setChecklist] = useState<OnboardingChecklist | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    getOnboardingChecklist()
      .then(setChecklist)
      .catch(() => undefined);
  }, []);

  if (!checklist || checklist.completedAt || hidden) return null;

  async function handleSkip(step: OnboardingStep) {
    try {
      const updated = await markOnboardingStep(step);
      setChecklist(updated);
    } catch {
      // tichý fail
    }
  }

  return (
    <section className="bg-gradient-to-r from-brand-50 to-blue-50 border-2 border-brand-200 rounded-xl p-5 mb-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-brand-900">
            🚀 Začínáme — {checklist.completedCount} z {checklist.totalCount} kroků hotových
          </h3>
          <p className="text-sm text-brand-700 mt-0.5">
            Dokonči setup salonu, ať můžeš začít přijímat rezervace.
          </p>
        </div>
        <button
          onClick={() => setHidden(true)}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Skrýt
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-white rounded-full h-2 mb-4">
        <div
          className="bg-brand-600 h-2 rounded-full transition-all"
          style={{ width: `${checklist.progressPercent}%` }}
        />
      </div>

      <ul className="space-y-1.5">
        {ITEMS.map((item) => {
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
    </section>
  );
}
