'use client';

import { useEffect, useState } from 'react';
import { getTenantInfo, type TenantInfo } from '@/lib/api';
import { ReservedApiError } from '@/lib/api';
import { BookingFlow } from '@/components/BookingFlow';

export default function TenantWidgetPage({ params }: { params: { slug: string } }) {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTenantInfo(params.slug)
      .then(setTenant)
      .catch((err) => {
        if (err instanceof ReservedApiError) {
          setError(err.message);
        } else {
          setError('Nelze načíst informace o salonu.');
        }
      });
  }, [params.slug]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <div className="text-5xl">😕</div>
          <h1 className="text-2xl font-bold">Salon nenalezen</h1>
          <p className="text-slate-600">{error}</p>
          <p className="text-sm text-slate-500">Zkontroluj, že máš v adrese správný slug salonu.</p>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">Načítám…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <p className="text-sm text-brand-600 font-semibold uppercase tracking-wide">
            Online rezervace
          </p>
          <h1 className="text-3xl md:text-4xl font-bold mt-1">{tenant.name}</h1>
        </header>
        <BookingFlow slug={params.slug} tenantName={tenant.name} />
      </div>
    </div>
  );
}
