// Domain types pro availability calculator. Všechno v UTC, konverze
// timezone se děje v UI vrstvě.

export interface TimeRange {
  /** UTC ISO timestamp. */
  startsAt: Date;
  endsAt: Date;
}

export interface WorkingHoursDay {
  dayOfWeek: number; // 1 = pondělí, 7 = neděle
  startTime: string; // "HH:MM"
  endTime: string;
  breakStartTime?: string | null;
  breakEndTime?: string | null;
  branchId?: string | null;
}

export interface AvailabilityRequest {
  /** Datum (lokální tenant timezone) ve formátu YYYY-MM-DD. */
  date: string;
  /** Trvání služby v minutách. */
  serviceDurationMinutes: number;
  /** Buffer čas — přípravka před schůzkou. */
  bufferBeforeMinutes: number;
  /** Buffer po — úklid mezi schůzkami. */
  bufferAfterMinutes: number;
  /** Working hours zaměstnance pro daný den (z employee_working_hours). */
  workingHours: WorkingHoursDay[];
  /** Existující rezervace zaměstnance (po odečtení vrátí volné okno). */
  existingBookings: TimeRange[];
  /** Aktivní holds (zatím neexpirované). */
  activeHolds: TimeRange[];
  /** Manuální blokace (úklid, školení, ...). */
  blocks: TimeRange[];
  /** Den je svátek? Pokud ano, salon zavřený = []. */
  isHoliday: boolean;
  /** Slot interval — krok mezi nabízenými časy. Default 15 min. */
  slotIntervalMinutes?: number;
  /** Tenant timezone (např. 'Europe/Prague') pro převod date+time → UTC. */
  timezone: string;
}

export interface AvailableSlot {
  /** UTC ISO. */
  startsAt: Date;
  /** UTC ISO. */
  endsAt: Date;
}
