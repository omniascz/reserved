# 17 — Onboarding Flow: Od registrace k první rezervaci

> Kritická cesta produktu. Zde se rozhoduje zda zákazník zůstane nebo odejde.
> Cíl: zákazník přijme první rezervaci do 15 minut od registrace.

---

## Přehled fází

```
[1. Landing]→[2. Registrace]→[3. Email verify]→[4. Wizard]→[5. Aha moment]→[6. Retence]
```

---

## FÁZE 1 — Landing page & vstupní bod

### Co zákazník vidí

Zákazník přijde z Google Ads, organického vyhledávání, doporučení nebo marketplace.

**Hlavní CTA:** "Začít zdarma — bez platební karty"

**Vstupní body:**
- `/` — hlavní landing
- `/pro/kadernictvi` — vertikálně cílená landing page (Beauty)
- `/pro/fitness` — Fitness
- `/pro/zdravotnictvi` — Healthcare
- atd. per vertikála

Každá vertikální landing má jiné screenshots, jiné testimonials, jiné use-cases — ale stejný registrační formulář.

---

## FÁZE 2 — Registrace

### Formulář (co se ptáme — minimum)

```
Krok 1 — O vás (30 sekund):
  Jméno *
  E-mail *
  Heslo * (min 8 znaků, 1 číslo)

Krok 2 — O firmě (60 sekund):
  Název firmy *
  Typ businessu * (select — viz níže)
  Počet zaměstnanců * (1 / 2–5 / 6–20 / 20+)
  Země *
```

**Typ businessu select:**
```
Krása & Wellness
  Kadeřnictví
  Masáže & Spa
  Nehty & Kosmetika
  Tetování & Piercing
  Solárium
  Jiné
Fitness & Sport
  Fitness centrum
  Skupinové lekce
  Personal training
  Sportovní kurty
  Jiné
Zdravotnictví
  Ordinace / klinika
  Fyzioterapie
  Psychologie
  Veterinář
  Jiné
Vzdělávání
  Jazyková škola
  Hudba / umění
  Autoškola
  Koučink
  Jiné
Ubytování & Hospitality
  Hotel / penzion
  Coworking
  Jiné
Automotive
  Autoservis
  Půjčovna
  Jiné
Ostatní
```

### Co se vytvoří při registraci

```sql
-- Atomická transakce:
1. INSERT INTO tenants (slug auto-generated z názvu firmy)
2. INSERT INTO users (role = 'owner')
3. INSERT INTO branches (default pobočka, název = název firmy)
4. INSERT INTO tenant_subscriptions (plan = 'trial', trial_ends_at = NOW() + 14 days)
5. INSERT INTO feature_flags assignments (dle plánu 'trial')
6. Enqueue: welcome_email
7. Audit log: tenant.created
```

**Slug generování:**
```
"Salon Jana Nováková" → "salon-jana-novakova"
Pokud obsazeno → "salon-jana-novakova-2"
```

### Sociální login (volitelné — fáze 2)
Google OAuth — jednodušší registrace, ale přeskakuje email verification.

---

## FÁZE 3 — Email verification

### Flow

```
Registrace dokončena
  → Zákazník dostane email s 6místným kódem (OTP)
     nebo magic link (jednodušší)
  → Přesměrován na /verify-email stránku
  → Zadá kód nebo klikne link
  → Email ověřen → spustí se onboarding wizard
```

### Co se stane pokud neověří

- Trial běží ale systém zobrazuje banner "Ověřte email pro plný přístup"
- Po 48h: připomínací email
- Po 7 dnech: druhý připomínací email
- Reservace přes online formulář jsou BLOKOVANÉ dokud není email ověřen
  (ochrana před spamem a fake účty)

### OTP tabulka

```sql
CREATE TABLE email_verifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id),
  token       VARCHAR(64) NOT NULL UNIQUE,
  otp_code    CHAR(6),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## FÁZE 4 — Onboarding Wizard

### Filosofie

Wizard není povinný — lze přeskočit. Ale bez dokončení vidí zákazník
prázdný dashboard a neví co dělat. Cíl: dovést ho k prvnímu
"živému" stavu systému co nejrychleji.

Wizard se zobrazí jednou — po email verification. Pak je dostupný
z "Setup checklist" v dashboardu.

---

### Krok 1 — Základní informace (předvyplněno z registrace)

```
Název firmy:        [Salon Jana Nováková    ]  ← předvyplněno
URL adresa:         [salon-jana-novakova    ].nasedomena.cz
Vlastní doména:     [                       ]  (volitelné)
Telefon:            [                       ]
Adresa pobočky:     [                       ]
Časová zóna:        [Europe/Prague          ]  ← auto-detect
Jazyk systému:      [Čeština                ]
Měna:               [CZK                    ]

Logo:               [Nahrát soubor] nebo přeskočit

[Pokračovat →]
```

**Po dokončení:** Branch se aktualizuje, tenant.settings se nastaví.

---

### Krok 2 — Přidat první službu

```
"Co nabízíte zákazníkům?"

Název služby:       [Dámský střih           ]
Délka:              [60] minut
Cena:               [500] Kč
Popis:              [                       ]  (volitelné)
Barva v kalendáři:  [●] (color picker)

[+ Přidat další službu]    [Pokračovat →]
```

**Chytré defaulty dle typu businessu:**

Systém předvyplní první službu podle `business_type`:
```
kadernictvi    → "Dámský střih", 60 min, 500 Kč
masaze         → "Klasická masáž", 60 min, 800 Kč
fitness_lekce  → "Skupinová lekce", 60 min, 200 Kč
fyzioterapie   → "Fyzioterapeutické sezení", 45 min, 900 Kč
...
```

Zákazník jen upraví čísla — nemusí nic vymýšlet.

---

### Krok 3 — Nastavit pracovní dobu

```
"Kdy jste otevřeni?"

         OD      DO      Přestávka
Pondělí  [09:00] [17:00] [12:00–13:00]  ✓ Zapnuto
Úterý    [09:00] [17:00] [          ]   ✓ Zapnuto
Středa   [09:00] [17:00] [          ]   ✓ Zapnuto
Čtvrtek  [09:00] [17:00] [          ]   ✓ Zapnuto
Pátek    [09:00] [15:00] [          ]   ✓ Zapnuto
Sobota   [     ] [     ] [          ]   ○ Zavřeno
Neděle   [     ] [     ] [          ]   ○ Zavřeno

[Použít Po–Pá pro všechny pracovní dny]  ← hromadné nastavení

[← Zpět]    [Pokračovat →]
```

**Po dokončení:** Vytvoří se `employee_working_hours` pro prvního zaměstnance (owner).

---

### Krok 4 — Pozvat tým (volitelné)

```
"Pracujete sami nebo máte tým?"

[Pracuji sám/sama]    ← přeskočí tento krok

nebo

Jméno zaměstnance:  [              ]
Email:              [              ]
Role:               [Zaměstnanec ▼]

[+ Přidat dalšího]

[← Zpět]    [Pokračovat →]
```

**Po dokončení:** Odešle se pozvánka e-mailem, vytvoří se `users` záznam se statusem `invited`.

---

### Krok 5 — Platby (volitelné, doporučené)

```
"Chcete přijímat platby online?"

○ Ano, chci přijímat platby kartou
  → Propojit Stripe účet [Připojit Stripe →]
  → nebo vytvořit nový [Vytvořit Stripe účet →]

○ Zatím ne, budu platby řešit osobně

[← Zpět]    [Dokončit nastavení →]
```

**Pokud přeskočeno:** Platby lze nastavit kdykoliv v Settings → Platby.

---

### Krok 6 — 🎉 Aha moment (completion screen)

```
┌─────────────────────────────────────────────┐
│  ✓ Vše je připraveno!                       │
│                                             │
│  Váš rezervační odkaz:                      │
│  salon-jana-novakova.nasedomena.cz          │
│  [Kopírovat odkaz]  [Otevřít v nové záložce]│
│                                             │
│  Co teď?                                    │
│  → Zkuste si rezervaci jako zákazník        │
│  → Sdílejte odkaz na Instagram              │
│  → Vložte rezervační tlačítko na web        │
│                                             │
│  [Přejít do dashboardu →]                   │
└─────────────────────────────────────────────┘
```

**Zároveň se automaticky:**
- Pošle email zákazníkovi s odkazem a 3 tipy jak začít
- Nastaví se `tenant.onboarding_completed_at`
- Spustí se onboarding email sekvence (D3, D7, D14)

---

## FÁZE 5 — Dashboard první spuštění

### Empty state (prázdný dashboard)

Pokud zákazník přeskočil wizard nebo nemá žádné rezervace:

```
┌─────────────────────────────────────────────┐
│  Dobrý den, Jano!                           │
│                                             │
│  Setup checklist               2/5 ✓        │
│  ▓▓▓▓▓░░░░░ 40 %                            │
│                                             │
│  ✓ Registrace dokončena                     │
│  ✓ Email ověřen                             │
│  ○ Přidat první službu          [Přidat →]  │
│  ○ Nastavit pracovní dobu       [Nastavit]  │
│  ○ Sdílet rezervační odkaz      [Sdílet →]  │
│                                             │
│  💡 Tip: Zákazníci si mohou rezervovat      │
│     online 24/7 na vašem odkazu.            │
└─────────────────────────────────────────────┘
```

**Setup checklist tabulka:**

```sql
CREATE TABLE onboarding_checklist (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL UNIQUE REFERENCES tenants(id),

  -- Kroky (true = dokončeno)
  email_verified          BOOLEAN NOT NULL DEFAULT FALSE,
  first_service_added     BOOLEAN NOT NULL DEFAULT FALSE,
  working_hours_set       BOOLEAN NOT NULL DEFAULT FALSE,
  link_shared             BOOLEAN NOT NULL DEFAULT FALSE,
  first_booking_received  BOOLEAN NOT NULL DEFAULT FALSE,
  payment_connected       BOOLEAN NOT NULL DEFAULT FALSE,
  team_member_invited     BOOLEAN NOT NULL DEFAULT FALSE,
  branding_customized     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Metadata
  completed_at    TIMESTAMPTZ,   -- kdy byl checklist 100% dokončen
  wizard_skipped  BOOLEAN NOT NULL DEFAULT FALSE,
  wizard_completed_at TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## FÁZE 6 — Email sekvence (onboarding drip)

### D0 — Okamžitě po registraci

**Subject:** "Váš rezervační systém je připraven 🎉"

```
Ahoj [Jméno],

váš rezervační systém je aktivní na:
[URL odkaz]

Tři věci které doporučuji udělat jako první:
1. Přidejte své služby (5 minut)
2. Nastavte pracovní dobu (2 minuty)
3. Sdílejte odkaz zákazníkům

[Dokončit nastavení →]

Trial: 14 dní zdarma, bez platební karty.
```

---

### D1 — Pokud wizard nebyl dokončen

**Subject:** "Ještě pár kroků a jste připraveni přijímat rezervace"

```
Ahoj [Jméno],

vidím že jste ještě nedokončili nastavení.
Zbývá vám: [dynamický seznam nedokončených kroků]

Celkem to zabere méně než 10 minut.

[Pokračovat v nastavení →]
```

---

### D3 — Pokud ještě žádná rezervace

**Subject:** "Jak získat první zákazníky online"

```
Ahoj [Jméno],

systém máte nastaven, ale zatím nepřišla žádná rezervace.

3 nejrychlejší způsoby jak to změnit:

1. Instagram: přidejte odkaz do bio
   Váš odkaz: [URL]

2. Google: přidejte odkaz do Google Business profilu

3. Stávající zákazníci: pošlete SMS nebo email
   s textem: "Nově lze u mě rezervovat online: [URL]"

[Otevřít váš rezervační odkaz →]
```

---

### D7 — Tip na konkrétní funkci

**Subject:** "Tip: Automatické připomínky snižují no-show o 40 %"

```
Ahoj [Jméno],

věděli jste že zákazníci kteří dostanou SMS připomínku
den před termínem zruší 3× méně?

Máte to zapnuté?
[Zkontrolovat nastavení připomínek →]
```

---

### D10 — Pokud trial běží a zákazník neupgradoval

**Subject:** "Váš trial vyprší za 4 dny"

```
Ahoj [Jméno],

zbývají vám 4 dny bezplatného trialu.

Co jste dosud využili:
• [X] rezervací přijato
• [X] zákazníků v databázi
• [X] hodin ušetřeno oproti telefonické rezervaci

Plán Pro: 990 Kč/měsíc
[Pokračovat s Pro →]    [Porovnat plány →]

Pokud máte otázky, odpovězte na tento email.
```

---

### D14 — Poslední den trialu

**Subject:** "Dnešní den je poslední den vašeho bezplatného trialu"

```
Ahoj [Jméno],

dnešním dnem vyprší váš bezplatný trial.

Co se stane zítra:
• Váš rezervační formulář bude deaktivován
• Zákazníci neuvidí dostupné termíny
• Vaše data zůstanou zachována po dobu 30 dní

Aktivujte plán nyní a nic se nezmění:
[Aktivovat plán →]

Nebo máte zájem o prodloužení trialu?
Odpovězte na tento email — rádi pomůžeme.
```

---

### D44 — 30 dní po vypršení trialu (pokud nekonvertoval)

**Subject:** "Vaše data budeme mazat za 30 dní"

```
Ahoj [Jméno],

před 30 dny vypršel váš trial a váš účet je neaktivní.

Za 30 dní smažeme vaše data v souladu s GDPR.

Pokud se chcete vrátit:
[Reaktivovat účet →]

Pokud chcete exportovat data:
[Stáhnout data →]
```

---

## Trial logika — co je dostupné kdy

### Během trialu (14 dní)

| Funkce | Trial | Starter | Pro |
|--------|-------|---------|-----|
| Online rezervační formulář | ✓ | ✓ | ✓ |
| Admin kalendář | ✓ | ✓ | ✓ |
| Email notifikace | ✓ | ✓ | ✓ |
| Zákazníci (max) | neomezeno | 500 | neomezeno |
| Zaměstnanci (max) | 5 | 1 | 10 |
| Pobočky (max) | 2 | 1 | 3 |
| SMS notifikace | ✓ (50 SMS) | — | ✓ |
| Online platby | ✓ | — | ✓ |
| Balíčky | ✓ | — | ✓ |
| Rules Engine | ✓ | — | ✓ |
| API přístup | — | — | — |
| Watermark "Powered by [X]" | NE | NE | NE |

**Filosofie trialu:** Ukážeme plnou hodnotu Pro plánu, ne okleštěný produkt.
Zákazník musí zažít co ztratí — ne hádat co by mohl mít.

---

### Po vypršení trialu

Systém přejde do **grace period 3 dny** — všechno funguje, jen se zobrazuje banner.

Po 3 dnech bez platby:
- Online rezervační formulář → stránka "Provozovatel momentálně nepřijímá online rezervace"
- Admin dashboard → funguje (lze exportovat data, upgradovat)
- Zákaznická data → zachována 30 dní
- Po 30 dnech → soft delete (data anonymizována ale zachována v DB pro účetnictví)

---

## Technická implementace

### Middleware pro kontrolu trial statusu

```typescript
// Na každý autentizovaný request:
@Injectable()
export class TenantStatusGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const tenant = context.getTenant();

    // Trial vypršel a není aktivní subscription
    if (
      tenant.status === 'trial' &&
      tenant.trial_ends_at < new Date() &&
      !tenant.has_active_subscription
    ) {
      // Public booking endpoints → blokovat
      // Admin endpoints → dovolit s warningem
      const isPublicEndpoint = context.isPublicBooking();
      if (isPublicEndpoint) throw new PaymentRequiredException();

      // Přidat header s upozorněním
      context.getResponse().setHeader('X-Trial-Expired', 'true');
    }

    return true;
  }
}
```

### Onboarding checklist auto-update triggery

```typescript
// Event-driven: při každé relevantní akci emit event
// EventEmitter nebo message queue (Redis BullMQ)

// Při přidání první služby:
this.events.emit('onboarding.step_completed', {
  tenantId,
  step: 'first_service_added'
});

// Handler:
@OnEvent('onboarding.step_completed')
async updateChecklist({ tenantId, step }) {
  await db.update(onboardingChecklist)
    .set({ [step]: true, updatedAt: new Date() })
    .where(eq(onboardingChecklist.tenantId, tenantId));

  // Zkontroluj jestli je checklist 100% hotový
  await this.checkCompletionAndNotify(tenantId);
}
```

---

## Metriky onboardingu (co měříme)

| Metrika | Cíl | Jak měříme |
|---------|-----|-----------|
| Registrace → email verify | > 80 % | onboarding_checklist.email_verified |
| Verify → wizard start | > 70 % | wizard_skipped = false |
| Wizard completion rate | > 60 % | wizard_completed_at IS NOT NULL |
| Time to first booking received | < 7 dní | first_booking_received_at |
| Trial → paid conversion | > 25 % | tenant_subscriptions.status = 'active' |
| D14 churn (nezaplatil) | < 75 % | |
| Support tickets D0–D7 | < 10 % registrací | |

**"Aha moment" definice:**
Zákazník přijme první **skutečnou** rezervaci od skutečného zákazníka.
Vše před tímto momentem je jen setup. Po tomto momentě konverzní pravděpodobnost
na placený plán stoupá na 60 %+.

Systém musí zákazníka k tomuto momentu dovést co nejrychleji.
