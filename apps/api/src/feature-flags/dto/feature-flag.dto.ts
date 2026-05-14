import { z } from 'zod';

// Klic = lowercase + underscore + dvojtecky pro namespace
const KEY_REGEX = /^[a-z][a-z0-9_]*(:[a-z0-9_]+)*$/;

export const UpsertFeatureFlagSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(
      KEY_REGEX,
      'Klíč musí být lowercase + underscore. Namespacing dvojtečkou (např. "beta:google_sync").',
    ),
  description: z.string().max(500).optional().nullable(),
  isEnabled: z.boolean(),
  config: z.record(z.unknown()).default({}),
});
export type UpsertFeatureFlagDto = z.infer<typeof UpsertFeatureFlagSchema>;

export const ToggleFeatureFlagSchema = z.object({
  isEnabled: z.boolean(),
});
export type ToggleFeatureFlagDto = z.infer<typeof ToggleFeatureFlagSchema>;
