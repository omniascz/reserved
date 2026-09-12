'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/NavHeader';
import {
  AdminApiError,
  clearAuth,
  getAccessToken,
  getCustomDomain,
  setCustomDomain,
  verifyCustomDomain,
  removeCustomDomain,
  type CustomDomainStatus,
} from '@/lib/api';

export default function CustomDomainPage() {
  const router = useRouter();
  const [status, setStatus] = useState<CustomDomainStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  useEffect(() => {
    getCustomDomain()
      .then((s) => {
        setStatus(s);
        setInput(s.customDomain ?? '');
      })
      .catch((e) => {
        if (e instanceof AdminApiError && e.status === 401) {
          clearAuth();
          router.replace('/login');
        } else {
          setError(e?.message ?? 'Chyba při načítání');
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  function clearMessages(): void {
    setError(null);
    setSuccess(null);
  }

  async function handleSave(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    clearMessages();
    setBusy(true);
    try {
      const next = await setCustomDomain(input.trim());
      setStatus(next);
      setSuccess(
        'Doména uložena. Nakonfiguruj DNS dle instrukcí níže, pak klikni na "Ověřit doménu".',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba při ukládání');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(): Promise<void> {
    clearMessages();
    setBusy(true);
    try {
      const next = await verifyCustomDomain();
      setStatus(next);
      if (next.verifiedAt) {
        setSuccess('Doména ověřena. Provoz na ni teď routujeme.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verifikace selhala');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(): Promise<void> {
    if (!confirm('Opravdu odstranit custom doménu? Klienti se vrátí na subdoménu reserved.cz.'))
      return;
    clearMessages();
    setBusy(true);
    try {
      await removeCustomDomain();
      const fresh = await getCustomDomain();
      setStatus(fresh);
      setInput('');
      setSuccess('Custom doména odstraněna.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba při mazání');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !status) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">Načítám…</div>
      </div>
    );
  }

  const isVerified = !!status.verifiedAt;

  return (
    <div className="min-h-screen bg-slate-50">
      <NavHeader />
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-2">Vlastní doména</h1>
        <p className="text-slate-600 mb-8">
          Místo <code className="bg-slate-100 px-1 rounded">salon.reserved.cz</code> můžeš svým
          klientům nabídnout rezervace na vlastní doméně, např.{' '}
          <code className="bg-slate-100 px-1 rounded">booking.tvujsalon.cz</code>.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-800 p-3 rounded mb-4 text-sm">
            {success}
          </div>
        )}

        {/* Doména setup */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-4">
            {status.customDomain ? 'Tvoje doména' : 'Nastav doménu'}
          </h2>

          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="domain">
                Hostname (FQDN)
              </label>
              <input
                id="domain"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="booking.tvujsalon.cz"
                pattern="^[a-z0-9.-]+$"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                disabled={busy}
              />
              <p className="text-xs text-slate-500 mt-1">
                Bez https://, bez cesty. Doména musí být tvoje (musíš mít přístup do DNS).
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {status.customDomain ? 'Aktualizovat' : 'Uložit doménu'}
              </button>
              {status.customDomain && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={busy}
                  className="text-red-600 hover:text-red-700 font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  Odstranit
                </button>
              )}
            </div>
          </form>
        </section>

        {/* DNS instrukce + verifikace */}
        {status.customDomain && (
          <section className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="font-bold text-lg">DNS nastavení</h2>
              {isVerified ? (
                <span className="bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-full">
                  ✓ Ověřeno
                </span>
              ) : (
                <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1 rounded-full">
                  ⏳ Čeká na ověření
                </span>
              )}
            </div>

            <p className="text-sm text-slate-600 mb-4">
              U registrátora domény (Wedos / Active24 / Cloudflare / atd.) přidej tyto dva záznamy:
            </p>

            {/* CNAME pro routing */}
            <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-4 font-mono text-xs space-y-1">
              <div>
                <span className="text-slate-500">Typ:</span> <strong>CNAME</strong>
              </div>
              <div>
                <span className="text-slate-500">Hostname:</span>{' '}
                <strong>{status.customDomain}</strong>
              </div>
              <div>
                <span className="text-slate-500">Hodnota:</span> <strong>{status.dnsTarget}</strong>
              </div>
              <div className="text-slate-500 mt-1 font-sans text-xs">
                Tento záznam směruje provoz z tvojí domény na Reserved server.
              </div>
            </div>

            {/* TXT pro verifikaci */}
            <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-4 font-mono text-xs space-y-1">
              <div>
                <span className="text-slate-500">Typ:</span> <strong>TXT</strong>
              </div>
              <div>
                <span className="text-slate-500">Hostname:</span>{' '}
                <strong>{status.verificationRecord}</strong>
              </div>
              <div>
                <span className="text-slate-500">Hodnota:</span>{' '}
                <strong>{status.verificationToken}</strong>
              </div>
              <div className="text-slate-500 mt-1 font-sans text-xs">
                Tento záznam dokazuje, že doménu vlastníš. Můžeš ho odstranit po ověření.
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              DNS změny propadávají typicky 5–30 minut. Někdy ale klidně i 24 h.
            </p>

            {!isVerified && (
              <button
                onClick={handleVerify}
                disabled={busy}
                className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {busy ? 'Ověřuji…' : 'Ověřit doménu'}
              </button>
            )}
          </section>
        )}

        {/* SSL info */}
        {isVerified && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="font-bold text-lg mb-2">SSL certifikát</h2>
            <p className="text-sm text-slate-600">
              Reserved automaticky vystaví Let's Encrypt SSL certifikát pro tvoji doménu. Trvá to
              obvykle do 5 minut po ověření DNS. Provoz pak běží přes HTTPS.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
