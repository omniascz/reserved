export * from './client.js';
export * as schema from './schema/index.js';

// Top-level reexporty pro hodnoty/typy, ktere nemaji smysl uvnitr `schema.*`
// namespace (event types, enums...). Tabulky zustavaji pristupne pres schema.X.
export { WEBHOOK_EVENT_TYPES } from './schema/webhooks.js';
export type { WebhookEventType } from './schema/webhooks.js';
