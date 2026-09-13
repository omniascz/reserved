import { z } from 'zod';

// GDPR endpointy — schémata vstupů.
//
// Výmaz je NEVRATNÝ, proto vyžaduje výslovné potvrzení v těle požadavku.
// Samotné trefení URL (překlep, zvědavé klikání, opakované odeslání formuláře)
// nesmí stačit k anonymizaci člověka.

export const EraseRequestSchema = z.object({
  /** Musí být `true`. Bez toho endpoint odmítne požadavek jako neplatný. */
  confirm: z.literal(true),
  /** Volitelný důvod — uloží se do auditní poznámky, ať je doložitelné, proč se mazalo. */
  reason: z.string().min(3).max(500).optional(),
});
export type EraseRequestDto = z.infer<typeof EraseRequestSchema>;
