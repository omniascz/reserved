import { describe, expect, it } from 'vitest';
import { staleReason } from '../stale-notification.js';

const start = new Date('2027-05-10T08:00:00.000Z');
const meta = { bookingStartsAt: start.toISOString() };

describe('staleReason', () => {
  it('platná připomínka platné rezervace → poslat', () => {
    expect(staleReason('booking_reminder', meta, { status: 'confirmed', startsAt: start })).toBe(
      null,
    );
    expect(staleReason('booking_reminder', meta, { status: 'pending', startsAt: start })).toBe(
      null,
    );
  });

  it('zrušená / proběhlá / no-show rezervace → neposílat', () => {
    for (const status of ['cancelled', 'completed', 'no_show']) {
      expect(staleReason('booking_reminder', meta, { status, startsAt: start })).toBe(
        `booking_${status}`,
      );
      expect(staleReason('booking_confirmation', {}, { status, startsAt: start })).toBe(
        `booking_${status}`,
      );
    }
  });

  it('přesunutá rezervace → připomínka starého termínu neplatí', () => {
    const moved = new Date('2027-05-12T08:00:00.000Z');
    expect(staleReason('booking_reminder', meta, { status: 'confirmed', startsAt: moved })).toBe(
      'booking_rescheduled',
    );
  });

  it('výzva k potvrzení se přesunem neruší (není vázaná na čas)', () => {
    const moved = new Date('2027-05-12T08:00:00.000Z');
    expect(
      staleReason('booking_confirmation', meta, { status: 'confirmed', startsAt: moved }),
    ).toBe(null);
  });

  it('starší připomínka bez metadat → rozhoduje jen stav', () => {
    const moved = new Date('2027-05-12T08:00:00.000Z');
    expect(staleReason('booking_reminder', {}, { status: 'confirmed', startsAt: moved })).toBe(
      null,
    );
  });

  it('jiné zprávy a zprávy bez rezervace se nekontrolují', () => {
    expect(staleReason('booking_cancelled', {}, { status: 'cancelled', startsAt: start })).toBe(
      null,
    );
    expect(staleReason('booking_reminder', meta, null)).toBe(null);
  });
});
