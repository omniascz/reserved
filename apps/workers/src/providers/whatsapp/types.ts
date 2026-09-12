// WhatsApp Business notification provider — abstrakce nad konkrétními BSP.
//
// WhatsApp Business funguje jinak než SMS:
//   - Vyžaduje schválené template messages od Mety (Meta Business approval).
//   - Pro proaktivní zprávy (mimo 24h conversation window) MUSÍ být template.
//   - Pro mediální obsah (PDF, obrázek) je další template typ.
//
// Pro v1 podporujeme jen text message s template name + variables.

export interface WhatsAppSendInput {
  /** E.164 formát: +420777123456 (bez prefixu 'whatsapp:'). */
  to: string;
  /** Schválený template name z Meta Business (např. 'booking_reminder'). */
  templateName: string;
  /** Variabilní hodnoty pro template — pořadí dle template definice. */
  variables: string[];
  /** Locale šablony (cs, en, ...). */
  language: string;
}

export interface WhatsAppSendResult {
  messageId: string;
  status: 'sent' | 'queued' | 'failed';
  cost?: number;
}

export interface WhatsAppProvider {
  name: string;
  send(input: WhatsAppSendInput): Promise<WhatsAppSendResult>;
}
