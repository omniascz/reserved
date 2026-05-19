'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getTenantInfo, type TenantInfo } from '@/lib/api';
import { ReservedApiError } from '@/lib/api';
import { BookingFlow } from '@/components/BookingFlow';
import { I18nProvider, useT } from '@/i18n/I18nProvider';
import { isLang } from '@/i18n/messages';

export default function TenantWidgetPage({ params }: { params: { slug: string } }) {
  const searchParams = useSearchParams();
  const langParam = searchParams.get('lang');
  // Default je 'cs'; v budoucnu lze rozšířit o tenant.locale z API.
  const lang = isLang(langParam) ? langParam : 'cs';

  return (
    <I18nProvider lang={lang}>
      <PageInner slug={params.slug} />
    </I18nProvider>
  );
}

function PageInner({ slug }: { slug: string }) {
  const t = useT();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTenantInfo(slug)
      .then(setTenant)
      .catch((err) => {
        if (err instanceof ReservedApiError) {
          setError(err.message);
        } else {
          setError(t('cantLoad'));
        }
      });
  }, [slug, t]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <div className="text-5xl">😕</div>
          <h1 className="text-2xl font-bold">{t('notFound')}</h1>
          <p className="text-slate-600">{error}</p>
          <p className="text-sm text-slate-500">{t('notFoundHelp')}</p>
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
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <p className="text-sm text-brand-600 font-semibold uppercase tracking-wide">
            {t('onlineBooking')}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold mt-1">{tenant.name}</h1>
        </header>
        <BookingFlow slug={slug} tenantName={tenant.name} />
      </div>
    </div>
  );
}
