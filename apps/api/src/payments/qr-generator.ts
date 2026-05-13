// Czech QR Platba (SPAYD format) — generuje string pro QR kod.
// Spec: https://qr-platba.cz/pro-vyvojare/specifikace-formatu/
//
// Format priklad:
//   SPD*1.0*ACC:CZ5508000000001234567899*AM:300.00*CC:CZK*MSG:Platba za balicek

export interface QrPaymentInput {
  iban: string; // CZ58... format
  amount: number; // v korunach (ne halerich!)
  currency?: string;
  variableSymbol?: string;
  message?: string;
}

export function generateSpaydString(input: QrPaymentInput): string {
  const parts: string[] = ['SPD*1.0'];
  parts.push(`ACC:${input.iban.replace(/\s/g, '').toUpperCase()}`);
  parts.push(`AM:${input.amount.toFixed(2)}`);
  parts.push(`CC:${input.currency ?? 'CZK'}`);
  if (input.variableSymbol) {
    parts.push(`X-VS:${input.variableSymbol}`);
  }
  if (input.message) {
    // Diakritiku nahradíme — QR ASCII friendly
    const ascii = input.message.normalize('NFD').replace(/[̀-ͯ]/g, '').substring(0, 60);
    parts.push(`MSG:${ascii}`);
  }
  return parts.join('*');
}
