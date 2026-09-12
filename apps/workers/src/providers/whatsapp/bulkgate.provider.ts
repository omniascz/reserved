// BulkGate WhatsApp Business provider — odesílá WA zprávy přes BulkGate BSP.
//
// API docs: https://www.bulkgate.com/docs/api/whatsapp/transactional
//
// Pre-req v BulkGate dashboard:
//   1. Aktivovaný WhatsApp Business účet
//   2. Verified business number
//   3. Schválené message templates u Mety (cca 2 dny)
//
// V dev mode použij MockWhatsAppProvider; tento provider vyžaduje produkční
// BulkGate account a aspoň jeden schválený template.

import type { WhatsAppProvider, WhatsAppSendInput, WhatsAppSendResult } from './types.js';

interface BulkGateConfig {
  appId: string;
  appToken: string;
  /** Číslo zaregistrované jako WA Business sender. */
  fromPhoneNumber: string;
}

interface BulkGateWaResponse {
  data?: {
    messages?: Array<{
      id: string;
      status: 'sent' | 'queued' | 'failed' | string;
      price?: number;
    }>;
  };
  error?: { message: string };
}

export class BulkGateWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'bulkgate-whatsapp';
  private readonly apiUrl = 'https://portal.bulkgate.com/api/2.0/whatsapp/transactional';

  constructor(private readonly config: BulkGateConfig) {}

  async send(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    const payload = {
      application_id: this.config.appId,
      application_token: this.config.appToken,
      from: this.config.fromPhoneNumber,
      to: input.to.replace(/^\+/, ''),
      template: {
        name: input.templateName,
        language: input.language,
        variables: input.variables,
      },
    };

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as BulkGateWaResponse;

    if (!response.ok || body.error) {
      const errMsg = body.error?.message ?? `HTTP ${response.status}`;
      throw new Error(`BulkGate WhatsApp send failed: ${errMsg}`);
    }

    const message = body.data?.messages?.[0];
    if (!message) {
      throw new Error('BulkGate WhatsApp: žádná zpráva v odpovědi');
    }

    return {
      messageId: message.id,
      status:
        message.status === 'sent' ? 'sent' : message.status === 'queued' ? 'queued' : 'failed',
      cost: message.price,
    };
  }
}
