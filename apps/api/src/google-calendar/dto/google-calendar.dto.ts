import { z } from 'zod';

/** PATCH admin/integrations/google/connections/:employeeId/inbound — přepnutí inbound syncu. */
export const SetInboundSchema = z.object({
  enabled: z.boolean(),
});
export type SetInboundDto = z.infer<typeof SetInboundSchema>;
