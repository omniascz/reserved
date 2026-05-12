'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PortalHeader } from '@/components/PortalHeader';
import {
  getAccessToken,
  getProfile,
  PortalApiError,
  setPassword,
  updateProfile,
  type PortalProfile,
} from '@/lib/api';

export default function ProfilePage() {
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(`/${tenant}/login`);
      return;
    }
    getProfile()
      .then(setProfile)
      .catch((e) => {
        if (e instanceof PortalApiError && (e.status === 401 || e.status === 403)) {
          router.replace(`/${tenant}/login`);
        } else {
          setError(e?.message ?? 'Chyba');
        }
      })
      .finally(() => setLoading(false));
  }, [tenant, router]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateProfile({
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
        marketingOptIn: profile.marketingOptIn,
      });
      setProfile(updated);
      setSuccess('Uloženo.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Heslo musí mít aspoň 8 znaků.');
      return;
    }
    setPwSaving(true);
    setError(null);
    try {
      await setPassword(newPassword);
      setNewPassword('');
      setSuccess('Heslo nastaveno. Příště se můžeš přihlásit i heslem.');
      // refetch profile aby se aktualizoval hasPassword
      const refreshed = await getProfile();
      setProfile(refreshed);
      setTimeout(() => setSuccess(null), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setPwSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <PortalHeader />
        <main className="p-6 text-slate-500">Načítám…</main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen">
        <PortalHeader />
        <main className="p-6 text-red-600">{error ?? 'Profil se nepodařilo načíst.'}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <PortalHeader />
      <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-1">Můj profil</h1>
        <p className="text-sm text-slate-500 mb-6">
          E-mail nelze měnit, protože k němu je vázané přihlášení.
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

        <form
          onSubmit={handleSaveProfile}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6 space-y-4"
        >
          <h2 className="font-semibold">Kontaktní údaje</h2>

          <div>
            <label className="block text-sm font-medium mb-1">E-mail</label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full px-3 py-2 border border-slate-200 bg-slate-50 text-slate-500 rounded-lg"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Jméno</label>
              <input
                type="text"
                value={profile.firstName}
                onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Příjmení</label>
              <input
                type="text"
                value={profile.lastName}
                onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Telefon</label>
            <input
              type="tel"
              value={profile.phone ?? ''}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value || null })}
              placeholder="+420 …"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={profile.marketingOptIn}
              onChange={(e) => setProfile({ ...profile, marketingOptIn: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Souhlasím s posíláním novinek a akcí na e-mail</span>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {saving ? 'Ukládám…' : 'Uložit'}
          </button>
        </form>

        <form
          onSubmit={handleSetPassword}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3"
        >
          <h2 className="font-semibold">
            {profile.hasPassword ? 'Změna hesla' : 'Nastavit heslo'}
          </h2>
          <p className="text-sm text-slate-500">
            {profile.hasPassword
              ? 'Zadej nové heslo, kterým se chceš přihlašovat.'
              : 'Pokud nechceš pokaždé čekat na e-mailový odkaz, nastav si heslo.'}
          </p>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            placeholder="Aspoň 8 znaků"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
          <button
            type="submit"
            disabled={pwSaving || newPassword.length < 8}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {pwSaving ? 'Ukládám…' : profile.hasPassword ? 'Změnit heslo' : 'Nastavit heslo'}
          </button>
        </form>
      </main>
    </div>
  );
}
