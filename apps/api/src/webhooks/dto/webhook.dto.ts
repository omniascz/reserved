import { z } from 'zod';
import { WEBHOOK_EVENT_TYPES } from '@reserved/db';

const eventTypeEnum = z.enum(WEBHOOK_EVENT_TYPES);

export const CreateWebhookSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  eventTypes: z.array(eventTypeEnum).min(1, 'Vyberte alespoň jeden typ události.'),
});

export const UpdateWebhookSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  url: z.string().url().optional(),
  eventTypes: z.array(eventTypeEnum).min(1).optional(),
  isActive: z.boolean().optional(),
});

export type CreateWebhookDto = z.infer<typeof CreateWebhookSchema>;
export type UpdateWebhookDto = z.infer<typeof UpdateWebhookSchema>;
