'use client';

import { useEffect, useState } from 'react';

export function CountdownTimer({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire?: () => void;
}) {
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
        <>⏱ Termín už není rezervovaný — vrať se prosím a vyber znovu.</>
      ) : (
        <>
          ⏱ Slot je pro tebe zamknutý ještě{' '}
          <span className="font-mono font-bold">
            {min}:{sec.toString().padStart(2, '0')}
          </span>
        </>
      )}
    </div>
  );
}
