'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@/lib/api';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    if (getAccessToken()) {
      router.replace('/calendar');
    } else {
      router.replace('/login');
    }
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center text-slate-400">Načítám…</div>
  );
}
