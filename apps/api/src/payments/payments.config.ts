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
});

@Injectable()
export class PaymentsConfig {
  private readonly _klic: SifrovaciKlic;

  constructor() {
    const env = PaymentsEnvSchema.parse(process.env);
    // `nactiKlic` ověří, že po dekódování vyjde přesně 32 bajtů, a jinak
    // vysvětlí, jak klíč vygenerovat.
    this._klic = nactiKlic(env.PAYMENT_CONFIG_KEY, 'PAYMENT_CONFIG_KEY');
  }

  get klic(): SifrovaciKlic {
    return this._klic;
  }
}
