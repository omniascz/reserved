'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n/I18nProvider';

export function CountdownTimer({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire?: () => void;
}) {
  const t = useT();
  const [remainingMs, setRemainingMs] = useState<number>(
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const r = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemainingMs(r);
      if (r === 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const totalSec = Math.floor(remainingMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const expired = remainingMs === 0;

  return (
    <div
      className={`text-xs ${expired ? 'text-red-600 font-bold' : 'text-slate-600'} pt-2 border-t border-brand-200`}
    >
      {expired ? (
        <>{t('timer.expired')}</>
      ) : (
        <>
          {t('timer.lockedFor')}{' '}
          <span className="font-mono font-bold">
            {min}:{sec.toString().padStart(2, '0')}
          </span>
        </>
      )}
    </div>
  );
}
