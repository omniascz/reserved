export * from './client.js';
export * as schema from './schema/index.js';

// Top-level reexporty pro hodnoty/typy, ktere nemaji smysl uvnitr `schema.*`
// namespace (event types, enums...). Tabulky zustavaji pristupne pres schema.X.
export { WEBHOOK_EVENT_TYPES } from './schema/webhooks.js';
export type { WebhookEventType } from './schema/webhooks.js';

export { platformActionTypes } from './schema/platform-admins.js';
export type { PlatformActionType } from './schema/platform-admins.js';

export { API_KEY_SCOPES } from './schema/api-keys.js';
export type { ApiKeyScope } from './schema/api-keys.js';

export { resourceTypes } from './schema/resources.js';
export type { ResourceType } from './schema/resources.js';

export { contentAccessLevels } from './schema/content.js';
export type { ContentAccessLevel } from './schema/content.js';

export { posPaymentMethods, posSaleItemTypes } from './schema/pos.js';
export type { PosPaymentMethod, PosSaleItemType } from './schema/pos.js';

export { accessGrantKinds } from './schema/access-grants.js';
export type { AccessGrantKind } from './schema/access-grants.js';

export { loyaltyRewardKinds } from './schema/loyalty.js';
export type { LoyaltyRewardKind } from './schema/loyalty.js';
