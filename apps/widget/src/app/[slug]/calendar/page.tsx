'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getTenantInfo, ReservedApiError, type TenantInfo } from '@/lib/api';
import { CalendarBooking } from '@/components/CalendarBooking';
import { I18nProvider, useT } from '@/i18n/I18nProvider';
import { isLang } from '@/i18n/messages';
import { themeToCss } from '@/lib/theme';
import { initAutoResize } from '@/lib/auto-resize';

export default function CalendarPage({ params }: { params: { slug: string } }) {
  const searchParams = useSearchParams();
  const langParam = searchParams.get('lang');
  const lang = isLang(langParam) ? langParam : 'cs';
  const service = searchParams.get('service') ?? undefined;

  return (
    <I18nProvider lang={lang}>
      <PageInner slug={params.slug} presetServiceId={service} />
    </I18nProvider>
  );
}

function PageInner({ slug, presetServiceId }: { slug: string; presetServiceId?: string }) {
  const t = useT();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTenantInfo(slug)
      .then(setTenant)
      .catch((err) => setError(err instanceof ReservedApiError ? err.message : t('cantLoad')));
  }, [slug, t]);

  useEffect(() => initAutoResize(), [tenant]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <div className="text-5xl">😕</div>
          <h1 className="text-2xl font-bold">{t('notFound')}</h1>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">{t('loading')}</div>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(tenant.theme) }} />
      <div className="min-h-screen p-4 md:p-6">
        <div className="max-w-md mx-auto">
          <header className="mb-4 flex items-center gap-3">
            {tenant.theme?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.theme.logoUrl} alt={tenant.name} className="h-10 w-auto" />
            )}
            <h1 className="text-2xl font-bold">{tenant.name}</h1>
          </header>
          <CalendarBooking slug={slug} presetServiceId={presetServiceId} />
        </div>
      </div>
    </>
  );
}
