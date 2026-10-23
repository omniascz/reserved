// Konfigurace šifrování přístupů k platebním bránám.
//
// Validuje se v konstruktoru — chybějící nebo krátký klíč shodí aplikaci při
// startu, ne až ve chvíli, kdy provozovatel ukládá přístupy k bráně. Tichý
// běh bez šifrování by byl horší než pád: přístupy k cizím penězům by se zase
// ukládaly čitelně a nikdo by si toho nevšiml.

import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { nactiKlic, type SifrovaciKlic } from '@reserved/utils';

const PaymentsEnvSchema = z.object({
  PAYMENT_CONFIG_KEY: z
    .string({ required_error: 'PAYMENT_CONFIG_KEY není nastavený' })
    .min(1, 'PAYMENT_CONFIG_KEY nesmí být prázdný'),
  /**
   * JEN PRO TESTY: jiná adresa Stripe API (stripe-mock, falešný server).
   * V produkci se nenastavuje — Stripe SDK pak volá api.stripe.com.
   */
  STRIPE_API_BASE: z.string().url().optional(),
  /** Zákaznický portál — sem se zákazník vrátí po uložení karty. */
  PORTAL_BASE_URL: z.string().url().default('http://localhost:4003'),
});

@Injectable()
export class PaymentsConfig {
  private readonly _klic: SifrovaciKlic;
  private readonly _stripeApiBase: URL | null;
  private readonly _portalBaseUrl: string;

  constructor() {
    const env = PaymentsEnvSchema.parse(process.env);
    this._stripeApiBase = env.STRIPE_API_BASE ? new URL(env.STRIPE_API_BASE) : null;
    this._portalBaseUrl = env.PORTAL_BASE_URL.replace(/\/+$/, '');
    // `nactiKlic` ověří, že po dekódování vyjde přesně 32 bajtů, a jinak
    // vysvětlí, jak klíč vygenerovat.
    this._klic = nactiKlic(env.PAYMENT_CONFIG_KEY, 'PAYMENT_CONFIG_KEY');
  }

  get klic(): SifrovaciKlic {
    return this._klic;
  }

  /** Základ adresy zákaznického portálu (bez lomítka na konci). */
  get portalBaseUrl(): string {
    return this._portalBaseUrl;
  }

  /** Přesměrování Stripe API pro testy; `null` = skutečný Stripe. */
  get stripeApiBase(): URL | null {
    return this._stripeApiBase;
  }
}
