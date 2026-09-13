import { z } from 'zod';

// Sjednocený pohled na vydané permanentky (UI 2). Tři typy instancí:
//   credit = customer_credit_packs · bundle = customer_bundle_packs · time = customer_time_packs

export const passTypes = ['credit', 'bundle', 'time'] as const;
export type PassType = (typeof passTypes)[number];

/**
 * Stav se ve výpisu počítá z DAT, ne ze sloupce `status` — propadlá permanentka
 * se uloženým stavem `active` se musí ukázat jako propadlá.
 */
export const passEffectiveStatuses = [
  'active',
  'expired',
  'used_up',
  'suspended',
  'cancelled',
  'refunded',
  'rolled_over',
] as const;
export type PassEffectiveStatus = (typeof passEffectiveStatuses)[number];

export const ListPassesQuerySchema = z.object({
  type: z.enum(passTypes).optional(),
  /** Filtruje podle VYPOČTENÉHO stavu, ne podle sloupce. */
  status: z.enum(passEffectiveStatuses).optional(),
  customerId: z.string().uuid().optional(),
  /** Jen instance vydané z konkrétní šablony (credit_pack_id / bundle_pack_id / time_pack_id). */
  packId: z.string().uuid().optional(),
  /** Hledá v jméně, příjmení a e-mailu klienta. */
  search: z.string().min(1).max(200).optional(),
  /** Jen permanentky, které propadnou do N dnů (a ještě nepropadly). */
  expiringWithinDays: z.coerce.number().int().min(1).max(3650).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListPassesQueryDto = z.infer<typeof ListPassesQuerySchema>;

export const PassTypeParamSchema = z.enum(passTypes);

/** Pozastavení i obnovení vyžaduje poznámku — jde o zásah do zaplacené služby. */
export const SuspendPassSchema = z.object({
  note: z.string().min(1).max(500),
});
export type SuspendPassDto = z.infer<typeof SuspendPassSchema>;
