// Mock WhatsApp provider — pro dev mode bez Meta Business approval.
// Loguje zprávu do console místo skutečného odeslání.

import { randomUUID } from 'node:crypto';
import type { WhatsAppProvider, WhatsAppSendInput, WhatsAppSendResult } from './types.js';

export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'mock';

  async send(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    const messageId = `mock-wa-${randomUUID()}`;
    // eslint-disable-next-line no-console
    console.log(
      `[whatsapp:mock] → ${input.to} | template=${input.templateName} | lang=${input.language} | vars=${JSON.stringify(input.variables)}`,
    );
    return { messageId, status: 'sent' };
  }
}
