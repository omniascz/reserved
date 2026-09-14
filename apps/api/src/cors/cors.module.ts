// Modul se seznamem povolených adres (včetně vlastních domén zákazníků).
//
// Je GLOBÁLNÍ ze dvou důvodů:
//   1. Službu potřebuje `CustomDomainsService`, aby po nastavení, ověření
//      a smazání domény vyvolala okamžité obnovení seznamu. Kdyby se modul
//      musel importovat, znamenalo by to zbytečné provázání modulů.
//   2. Stejný vzor už v projektu je u `DbModule`.

import { Global, Module } from '@nestjs/common';
import { DrizzleNacitacDomen } from './nacitac-domen.service.js';
import { NACITAC_OVERENYCH_DOMEN, PovoleneOriginyService } from './povolene-originy.service.js';

@Global()
@Module({
  providers: [
    { provide: NACITAC_OVERENYCH_DOMEN, useClass: DrizzleNacitacDomen },
    PovoleneOriginyService,
  ],
  exports: [PovoleneOriginyService],
})
export class CorsModule {}
