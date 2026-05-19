export interface SmsSendInput {
  /** E.164 formát: +420777123456. */
  to: string;
  body: string;
  /** Volitelný custom sender ID; jinak default z konfigurace. */
  sender?: string;
}

export interface SmsSendResult {
  /** Provider-specific ID pro tracking. */
  messageId: string;
  /** Cost v jednotce poskytovatele (informativní). */
  cost?: number;
  /** Status po odeslání (provider report). */
  status: 'sent' | 'queued' | 'failed';
}

export interface SmsProvider {
  name: string;
  send(input: SmsSendInput): Promise<SmsSendResult>;
}
