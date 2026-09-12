import type { Env } from '../../config.js';
import { BulkGateWhatsAppProvider } from './bulkgate.provider.js';
import { MockWhatsAppProvider } from './mock.provider.js';
import type { WhatsAppProvider } from './types.js';

export type { WhatsAppProvider, WhatsAppSendInput, WhatsAppSendResult } from './types.js';

export function createWhatsAppProvider(env: Env): WhatsAppProvider {
  if (env.WHATSAPP_PROVIDER === 'bulkgate') {
    if (!env.BULKGATE_APP_ID || !env.BULKGATE_APP_TOKEN || !env.BULKGATE_WHATSAPP_FROM) {
      throw new Error(
        'WHATSAPP_PROVIDER=bulkgate vyžaduje BULKGATE_APP_ID, BULKGATE_APP_TOKEN, BULKGATE_WHATSAPP_FROM.',
      );
    }
    return new BulkGateWhatsAppProvider({
      appId: env.BULKGATE_APP_ID,
      appToken: env.BULKGATE_APP_TOKEN,
      fromPhoneNumber: env.BULKGATE_WHATSAPP_FROM,
    });
  }
  return new MockWhatsAppProvider();
}
