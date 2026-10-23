// Poslední kontrola před odesláním zprávy k rezervaci.
//
// API při stornu a přesunu ruší naplánované zprávy samo (vzor
// `cancelWithReference` z cal.com). Míst, kde se rezervace ruší, je ale
// hodně (admin, portál, série, lekce, smart, kurzy), takže worker to před
// odesláním ověří ještě jednou — a zprávu k neplatnému termínu nepošle.

/** Zprávy, které mají smysl jen před termínem platné rezervace. */
const PRE_VISIT_TEMPLATES = new Set(['booking_reminder', 'booking_confirmation']);
const ACTIVE_STATUSES = new Set(['pending', 'confirmed']);

export interface RelatedBooking {
  status: string;
  startsAt: Date;
}

/**
 * Vrátí důvod, proč zprávu už neposílat, nebo `null`, když platí.
 * `booking` je `null`, když zpráva k rezervaci nepatří (nebo byla smazána).
 */
export function staleReason(
  templateCode: string,
  metadata: unknown,
  booking: RelatedBooking | null,
): string | null {
  if (!PRE_VISIT_TEMPLATES.has(templateCode) || !booking) return null;
  if (!ACTIVE_STATUSES.has(booking.status)) return `booking_${booking.status}`;

  if (templateCode === 'booking_reminder') {
    const meta = (metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.bookingStartsAt === 'string') {
      const planned = new Date(meta.bookingStartsAt).getTime();
      if (!Number.isNaN(planned) && planned !== booking.startsAt.getTime()) {
        return 'booking_rescheduled';
      }
    }
  }
  return null;
}
