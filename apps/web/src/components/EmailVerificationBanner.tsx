'use client';

// Žlutý pruh pro účet s nepotvrzeným e-mailem.
//
// Záměrně NENÍ modální okno: neověřený účet smí celý admin používat, jen mu
// nefunguje veřejný rezervační formulář a rozesílání pošty klientům. Pruh je
// připomínka, ne závora.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  getAccessToken,
  getEmailVerificationStatus,
  resendVerificationEmail,
  type EmailVerificationStatus,
} from '@/lib/api';

export function EmailVerificationBanner() {
  const pathname = usePathname();
  const [status, setStatus] = useState<EmailVerificationStatus | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Čte se z prohlížeče až po připojení — čtení tokenu při renderu je zdroj
    // chyb hydratace (viz OPRAVY 2).
    //
    // POZOR na `pathname` v závislostech: komponenta sedí v kořenovém layoutu,
    // který se mezi stránkami NEPŘEMONTUJE. S prázdným polem by se tedy zeptala
    // jen jednou — typicky na /login, kde token ještě není — a po přihlášení by
    // se už nikdy nezeptala znovu, takže by se pruh nezobrazil. Stejná past jako
    // u NavHeaderu.
    if (!getAccessToken()) {
      setStatus(null);
      return;
    }
    // Ověřený účet se nemusí doptávat při každém překliku.
    if (status?.verified) return;

    getEmailVerificationStatus()
      .then(setStatus)
      .catch(() => undefined);
    // `status` schválně NENÍ v závislostech — jinak by se efekt spouštěl po
    // každé vlastní odpovědi dokola.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!status || status.verified) return null;

  async function handleResend(): Promise<void> {
    setSending(true);
    setMessage(null);
    try {
      const res = await resendVerificationEmail();
      setMessage(
        res.sent
          ? `Odkaz jsme poslali na ${res.email}. Zkontrolujte poštu.`
          : 'E-mail se nepodařilo odeslat. Zkuste to prosím za chvíli znovu.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Odeslání se nezdařilo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="bg-amber-50 border-b border-amber-300 text-amber-900"
      data-testid="email-banner"
    >
      <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <strong className="font-semibold">Potvrďte svůj e-mail.</strong>{' '}
          <span>
            Poslali jsme odkaz na <span className="font-mono">{status.email}</span>. Dokud adresu
            nepotvrdíte, váš rezervační formulář nepřijímá rezervace a nelze rozesílat e-maily
            klientům.
          </span>
          {message && <div className="mt-1 text-amber-800">{message}</div>}
        </div>
        <button
          onClick={handleResend}
          disabled={sending}
          className="whitespace-nowrap bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded"
        >
          {sending ? 'Odesílám…' : 'Poslat znovu'}
        </button>
      </div>
    </div>
  );
}
