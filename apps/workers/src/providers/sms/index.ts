import type { Env } from '../../config.js';
import { BulkGateSmsProvider } from './bulkgate.provider.js';
import { MockSmsProvider } from './mock.provider.js';
import type { SmsProvider } from './types.js';

export type { SmsProvider, SmsSendInput, SmsSendResult } from './types.js';

export function createSmsProvider(env: Env): SmsProvider {
  if (env.SMS_PROVIDER === 'bulkgate') {
    if (!env.BULKGATE_APP_ID || !env.BULKGATE_APP_TOKEN) {
      throw new Error(
        'BulkGate SMS provider zvolen, ale BULKGATE_APP_ID nebo BULKGATE_APP_TOKEN chybí v env.',
      );
    }
    return new BulkGateSmsProvider({
      appId: env.BULKGATE_APP_ID,
      appToken: env.BULKGATE_APP_TOKEN,
      defaultSender: env.BULKGATE_SENDER,
    });
  }
  return new MockSmsProvider();
}
