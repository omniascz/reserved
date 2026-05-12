'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getAccessToken, setTenantSlug } from '@/lib/api';

export default function TenantHome() {
  const { tenant } = useParams<{ tenant: string }>();
  const router = useRouter();

  useEffect(() => {
    if (!tenant) return;
    setTenantSlug(tenant);
    if (getAccessToken()) {
      router.replace(`/${tenant}/bookings`);
    } else {
      router.replace(`/${tenant}/login`);
    }
  }, [tenant, router]);

  return null;
}
