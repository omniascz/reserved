import { randomUUID } from 'node:crypto';
import type { SmsProvider, SmsSendInput, SmsSendResult } from './types.js';

/**
 * MockSmsProvider — pro dev a testy. Zalogovat zprávu místo skutečného odeslání.
 * Identifikator generovan UUID, status vždy 'sent'.
 */
export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const messageId = `mock-${randomUUID()}`;
    // eslint-disable-next-line no-console
    console.log(
      `[SMS:mock] -> ${input.to} (${input.body.length} chars): "${input.body.slice(0, 60)}..." (msgId=${messageId})`,
    );
    return { messageId, status: 'sent' };
  }
}
