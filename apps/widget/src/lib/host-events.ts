// Události z widgetu do stránky provozovny (rodičovské okno iframu).
//
// Vzor cal.com embed (calcom/cal.diy@0f19cc4
// packages/embeds/embed-core/src/sdk-action-manager.ts — `bookingSuccessfulV2`,
// MIT): po dokončené rezervaci widget pošle rodiči zprávu, aby web provozovny
// mohl změřit konverzi (Meta pixel, GA4, GTM). Bez toho reklama nevěděla,
// že z návštěvy vznikla rezervace. Zprávu přebírá embed.js.

export const BOOKING_SUCCESS_MESSAGE = 'reserved:booking_success';

export interface BookingSuccessDetail {
  /** Verze tvaru zprávy — při nekompatibilní změně zvýšit. */
  version: 1;
  /** Jednorázová rezervace (1:1) nebo přihláška na lekci. */
  kind: 'appointment' | 'class';
  bookingId: string;
  referenceCode: string;
  serviceId: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  /** Cena v haléřích / centech (celé číslo). */
  priceHellers: number | null;
  currency: string | null;
}

/** Pošle rodiči zprávu o dokončené rezervaci. Mimo iframe nedělá nic. */
export function notifyBookingSuccess(detail: BookingSuccessDetail): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  // Cílový origin neznáme (widget běží na cizích webech) — zpráva neobsahuje
  // nic citlivého, jen údaje pro měření. embed.js si naopak ověřuje, že
  // zpráva přišla z NAŠEHO iframu.
  window.parent.postMessage({ type: BOOKING_SUCCESS_MESSAGE, ...detail }, '*');
}
