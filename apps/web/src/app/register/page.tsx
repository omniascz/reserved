'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminApiError, registerTenant, setAuth } from '@/lib/api';

const BUSINESS_TYPES = [
  { key: 'kadernictvi', label: 'Kadeřnictví / Barber' },
  { key: 'kosmetika', label: 'Kosmetika / Nehty' },
  { key: 'masaze', label: 'Masáže / Spa' },
  { key: 'fyzioterapie', label: 'Fyzioterapie / Rehabilitace' },
  { key: 'fitness', label: 'Fitness / Trenér' },
  { key: 'joga', label: 'Jóga / Pilates' },
  { key: 'lekarska_ordinace', label: 'Lékařská ordinace' },
  { key: 'psychologie', label: 'Psychologie / Terapie' },
  { key: 'koucink', label: 'Koučink / Konzultace' },
  { key: 'autoskola', label: 'Autoškola' },
  { key: 'vzdelavani', label: 'Vzdělávání / Doučování' },
  { key: 'pravo', label: 'Právní kancelář' },
  { key: 'foto', label: 'Foto studio' },
  { key: 'other', label: 'Jiné' },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30);
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1 — o vás
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Step 2 — o firmě
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [businessType, setBusinessType] = useState<string>(BUSINESS_TYPES[0]!.key);

  function goToStep2(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!firstName || !lastName) {
      setError('Vyplň jméno a příjmení.');
      return;
    }
    if (!email) {
      setError('Vyplň email.');
      return;
    }
    if (password.length < 10) {
      setError('Heslo musí mít alespoň 10 znaků.');
      return;
    }
    setStep(2);
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!tenantName || tenantName.length < 2) {
      setError('Vyplň název firmy.');
      return;
    }
    if (!tenantSlug.match(/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/)) {
      setError('URL adresa musí být ve formátu kebab-case (např. „mujsalon").');
      return;
    }
    setBusy(true);
    try {
      const result = await registerTenant({
        tenantSlug,
        tenantName,
        email,
        password,
        firstName,
        lastName,
        currency: 'CZK',
        locale: 'cs-CZ',
      });
      // Uložit tokeny + slug, pak redirect na onboarding
      setAuth(result.tokens.accessToken, result.tokens.refreshToken, tenantSlug);
      // Uložit business type do session storage pro onboarding wizard
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('onboarding_business_type', businessType);
      }
      router.replace('/onboarding');
    } catch (e) {
      if (e instanceof AdminApiError) {
        if (e.code === 'SLUG_TAKEN' || e.message.includes('already exists')) {
          setError('Tato URL adresa je už obsazená. Vyber jinou.');
        } else if (e.code === 'EMAIL_TAKEN' || e.message.includes('email')) {
          setError('Tento email už je registrovaný.');
        } else {
          setError(e.message);
        }
      } else {
        setError('Něco se pokazilo. Zkus to znovu.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-slate-50 to-white p-4 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
        <div className="bg-brand-600 text-white px-8 py-5">
          <h1 className="text-2xl font-bold">Vyzkoušej Reserved zdarma</h1>
          <p className="text-brand-100 text-sm mt-1">
            14 dní zdarma · bez platební karty · krok {step} ze 2
          </p>
        </div>

        <div className="p-8">
          {/* Progress bar */}
          <div className="flex items-center mb-6">
            <div
              className={`flex-1 h-1 rounded-full ${step >= 1 ? 'bg-brand-600' : 'bg-slate-200'}`}
            />
            <div className="px-3 text-xs text-slate-500">→</div>
            <div
              className={`flex-1 h-1 rounded-full ${step >= 2 ? 'bg-brand-600' : 'bg-slate-200'}`}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded mb-4">
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={goToStep2} className="space-y-4">
              <h2 className="text-lg font-semibold mb-2">O vás</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Jméno">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </Field>
                <Field label="Příjmení">
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </Field>
              </div>
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  placeholder="vase@email.cz"
                />
              </Field>
              <Field label="Heslo" help="Min 10 znaků.">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={10}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </Field>
              <button
                type="submit"
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg"
              >
                Pokračovat →
              </button>
              <p className="text-center text-sm text-slate-500">
                Už máš účet?{' '}
                <Link href="/login" className="text-brand-700 hover:underline">
                  Přihlas se
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-lg font-semibold mb-2">O firmě</h2>
              <Field label="Název firmy / salonu">
                <input
                  type="text"
                  value={tenantName}
                  onChange={(e) => {
                    setTenantName(e.target.value);
                    if (!tenantSlug || tenantSlug === slugify(tenantName)) {
                      setTenantSlug(slugify(e.target.value));
                    }
                  }}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  placeholder="Salon Jana Novák"
                />
              </Field>
              <Field
                label="URL adresa"
                help="Tvá veřejná adresa pro klienty (např. mujsalon.reserved.cz). Kebab-case, jen písmena, čísla a pomlčky."
              >
                <div className="flex items-center">
                  <input
                    type="text"
                    value={tenantSlug}
                    onChange={(e) => setTenantSlug(e.target.value.toLowerCase())}
                    required
                    minLength={2}
                    maxLength={32}
                    pattern="[a-z][a-z0-9-]*[a-z0-9]"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-l-lg"
                    placeholder="mujsalon"
                  />
                  <span className="px-3 py-2 bg-slate-100 border border-l-0 border-slate-300 rounded-r-lg text-sm text-slate-600">
                    .reserved.cz
                  </span>
                </div>
              </Field>
              <Field label="Obor" help="Předkonfigurujeme ti šablonu služeb a nastavení.">
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  {BUSINESS_TYPES.map((bt) => (
                    <option key={bt.key} value={bt.key}>
                      {bt.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
                Kliknutím souhlasíš s{' '}
                <a href="#" className="text-brand-700 hover:underline">
                  Obchodními podmínkami
                </a>{' '}
                a{' '}
                <a href="#" className="text-brand-700 hover:underline">
                  Zpracováním osobních údajů
                </a>
                .
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  ← Zpět
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50"
                >
                  {busy ? 'Vytvářím účet…' : 'Vytvořit účet zdarma'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
      {help && <p className="text-xs text-slate-500 mt-1">{help}</p>}
    </div>
  );
}
