# Gap analýza fitness/cvičebních studií 2026 — co Reserved chybí

> Zdroj: živá rešerše ~60 reálných provozů + 10 rezervačních platforem (CZ + UK/US/DACH/AU)
>
> - multi-disciplinární „cvičební domy". Porovnáno proti reálně ověřeným schopnostem
>   Reserved (z auditu kódu + dostavby A/B/C). Tvrzení o konkurenci jsou z navštívených webů.

---

## 1. Jak dnes reálně vypadá fitness web + rezervace (shrnutí rešerše)

**Strukturální fakta z reality:**

- **Vlastní web na vlastní doméně = standard**, ale **rezervace skoro vždy odchází z prezentačního webu na oddělený systém** (subdoména / cizí platforma). Tlačítko „Rezervovat" = redirect.
- **Trh rezervačních systémů je tříštěný.** ČR: eFitness, aFitWeb, Reservio, CLUBSPIRE, iSportSystem, Reservanto, Gymify, reenio, INRS, Memberzone + vlastní řešení. Svět: Mindbody, Mariana Tek, Glofox, ClubReady, Hapana, Wodify, PushPress, zingfit, Magicline, Eversports.
- **Tři rezervační modely podle typu provozu:** (a) lekcový/členský za přihlášením, (b) slotový samoobslužný (privátní posilovny — platba kartou za blok + PIN/QR na dveře), (c) klasický open gym bez rezervace.

**Co je dnes BRANŽOVÝ STANDARD (má skoro každá platforma):**
rozvrh+kapacita · členství/kredity/balíčky · předplatné s autopay · online platby + POS ·
klientská app · waitlist s auto-promote · automatizovaná retence (email/SMS) · reporting.

**Co je ŠPIČKA / DIFERENCIÁTOR (odděluje premium):**

- **Spot booking** (výběr konkrétního místa/kola/reformeru v sále) — Mariana Tek (vlajkové), Mindbody Pick-a-Spot, Glofox, Eversports, WellnessLiving. SoulCycle (kolo) a Barry's (číslovaný pás) z toho dělají core zážitek.
- **Leaderboardy + sezónní challenges** (z docházky) — retenční motor, který využívá data, jež rezervační systém vlastní (kdo kolik odcvičil). Pozn.: měření tepu / wearables (F45, Orangetheory) je věc hardwaru a trenéra, NE rezervačního systému — Reserved to záměrně neřeší.
- **Dynamické ceny** (off-peak / dle poptávky) — vzácné (WellnessLiving, Mindbody, ClassPass SmartRate).
- **Vlastní spotřebitelský marketplace** (akviziční traffic) — Mindbody (3M+), Eversports, Vagaro, WellnessLiving; jinak se spoléhá na ClassPass.
- **Kiosk / QR / turniket check-in** — kiosk má většina; turniket/access control je špička (ClubSpire vlastní turnikety, Glofox přes Kisi).
- **Branded nativní app pro studio** — dnes spíš standard, ale většinou placený add-on / nejvyšší tarif.

**Klíčová bolest „cvičebních domů" (smíšených provozů):** NIKDO nemá jeden plně sjednocený rezervační + platební tok napříč disciplínami. Šev se láme vždy na: (1) time-slot lekce vs appointment služby (spa/fyzio/masáž — jiný flow, často jiná doména/systém), (2) vstup do prostoru (bazén/sauna přes pokladnu) vs rezervace lekce, (3) prémiové disciplíny vyříznuté z členství (reformer, 1:1, workshopy), (4) kurzový/semestrální svět vs jednorázový vstup (+ ruční náhrady). Velké domy (Life Time, Equinox, David Lloyd, Third Space) skončí s 2–4 nástroji; appka sjednotí jen vizuál, pod ním zůstávají oddělené platební produkty.

---

## 2. Co Reserved UŽ MÁ (ověřeno z kódu) — a kde je to napřed

Reserved **už dnes pokrývá branžový standard kompletně a část špičky**:

| Oblast                                                                                                                                                                                                                                                                                                        | Reserved   | Pozn.                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------- |
| Lekce s kapacitou, 1:1, přístroj/zdroj (EMS), víc zdrojů, pobyt, řetězené, dispečink                                                                                                                                                                                                                          | ✅         | multi-modální engine — širší než kdokoli z porovnávaných |
| Opakovaný rozvrh + kurzy/série + **opakovaná rezervace zákazníka (portál)**                                                                                                                                                                                                                                   | ✅         |                                                          |
| Availability engine, buffery, sloty s hold, **waitlist + auto-promote**                                                                                                                                                                                                                                       | ✅         | waitlist Reserviu (hlavní CZ konkurent) **chybí**        |
| **Spot booking** (výběr místa) + mapa volných/obsazených                                                                                                                                                                                                                                                      | ✅ backend | viz mezera níže = vizuální plánek v UI                   |
| Tvrdé podmínky lekce (věk, prerekvizita)                                                                                                                                                                                                                                                                      | ✅         |                                                          |
| Permanentky credit/time/bundle (omezené na služby+pobočky, **roaming**), předplatné, **firemní B2B sdílené kredity**                                                                                                                                                                                          | ✅         | „kredit napříč" — to smíšené domy nemají                 |
| Vouchery (+ **online nákup**), **věrnost + tiery + katalog odměn**, **referral program**                                                                                                                                                                                                                      | ✅         |                                                          |
| POS, zálohy, **dynamická záloha dle no-show rizika**, **reálný strh storno/no-show**, refundace přes bránu, pay-per-slot                                                                                                                                                                                      | ✅         | dynamická záloha = unikát                                |
| **Access control — vstup kódem/QR (turniket)**                                                                                                                                                                                                                                                                | ✅         | odemyká open gym + privátní posilovnu na sloty           |
| CRM, portál (magic-link), email/SMS/**WhatsApp**, kampaně + win-back, recenze (+moderace), intake formuláře, **smart vrstva (proaktivní potvrzení)**, no-show skórování, video knihovna, payroll (+výplaty), narozeniny                                                                                       | ✅         |                                                          |
| Multi-tenant, multi-pobočka, white-label (doména, branding, **mini-web 3 šablony**), **embed widgety 3 režimy**, WP plugin, veřejné API+klíče, webhooky (+retry), reporting (+UI), master admin, vertikálové presety, feature flags, marketplace v1, **PWA**, Google Calendar, iCal, **Stripe Connect OAuth** | ✅         |                                                          |
| Platební brány: Stripe, GoPay, Comgate, ThePay, PayU, GP webpay, QR, hotovost                                                                                                                                                                                                                                 | ✅         | CZ pokrytí silnější než zahraniční systémy               |

**Vůči nejbližšímu CZ konkurentovi (Reservio):** Reserved má navíc auto-waitlist, spot booking, roaming kredity, věrnostní tiery, referral, dynamickou zálohu, access control, multi-modální engine — Reservio je proti tomu „základní rezervace".

**Unikátní moat:** Reserved jako jediný umí **víc režimů rezervace + jednu peněženku/kredit napříč obory v jednom systému** — přesně to, co rešerše ukázala, že **žádný smíšený cvičební dům dnes nemá** (každý má 2–4 oddělené nástroje).

---

## 3. CO RESERVED CHYBÍ (reálné mezery vůči špičce)

### 🔴 A. Diferenciátory fitness segmentu, které Reserved nemá

1. **Vizuální výběr místa v sále (floor-plan picker) ve widgetu.** Backend spot bookingu je hotový (spotLabel + mapa volných/obsazených), ale **chybí grafický plánek sálu** v rezervačním widgetu (klik na kolo/reformer na obrázku). U SoulCycle/Barry's/reformer studií je to core zážitek.
2. **Leaderboardy + sezónní challenges (z docházky).** Retenční motor postavený na datech, která rezervační systém vlastní (kdo kolik odcvičil) — „20 lekcí za měsíc" + žebříček. (Měření tepu / wearables je mimo rozsah rezervačního systému — věc hardwaru a trenéra, neřešíme.)
3. **Dynamické ceny lekcí** (off-peak / dle poptávky). Reserved má dynamickou _zálohu_ dle rizika, ne dynamickou _cenu lekce_.
4. **Kiosk / self-check-in obrazovka.** Access control validuje kód přes API, ale **chybí kiosk UI** (tablet na recepci: QR sken / PIN / odbavení příchozích na lekci).

### 🟠 B. Akviziční / síťové mezery (známé, těžké)

5. **Spotřebitelský marketplace s reálným trafficem.** Marketplace v1 bez návštěvníků — vejce/slepice, nedožene se featurou.
6. **ClassPass napojení + Reserve-with-Google.** Dnes téměř standard u zahraničních (8/10 platforem má ClassPass). Vyžaduje partnerské programy (skupina C).
7. **Nativní mobilní app pro studio** (App Store/Play). Reserved má PWA; nativní brandovaná app je u premium boutique standard.

### 🟡 C. Hloubka pro „smíšený cvičební dům" (kde je největší příležitost)

8. **Sjednocený „vstup do prostoru" (bazén/sauna/wellness) jako produkt v jednom košíku s lekcemi.** Reserved má access control + POS, ale ne hotový **„day-pass / vstupenku do wellness"**, na kterou jde použít stejný kredit jako na lekce.
9. **Appointment služby s jiným flow (spa/fyzio/masáž) sjednocené s rezervací lekcí** — 1:1 + zdroje umí, ale ne specifika typu treatment-room / pojišťovna / poukaz.
10. **Systémové náhrady (make-up) zameškaných lekcí** — vrácení do permanentky umí, ale ne „přehoď zameškanou lekci do jiného termínu/kurzu" jako produktovou funkci. Náhrady jsou u všech provozů ruční = příležitost.
11. **Sjednocený košík napříč typy** (lekce + wellness vstup + 1:1 + kurz + pronájem) v jedné objednávce/platbě.

---

## 4. Závěr a doporučené pořadí

**Reserved nestojí špatně — naopak.** Pokrývá celý branžový standard, část špičky (spot booking backend, access control, dynamická záloha, multi-modální engine, roaming kredity) a má **moat, který nikdo nemá**: jeden systém + jedna peněženka napříč obory. To je přesně ta díra, kterou rešerše našla u všech smíšených domů.

**Pořadí dostavby (poměr hodnota/úsilí):**

1. **Vizuální spot-picker ve widgetu** (#1) — backend hotový, chybí jen UI; rychlá výhra pro pilates/spinning.
2. **Kiosk self-check-in** (#4) — navazuje na hotový access control; odemyká „bezobslužný provoz" naplno.
3. **Hloubka smíšeného domu** (#8–#11): den-pass na wellness + sjednocený košík + systémové náhrady. **Tady je největší diferenciace** — udělá z Reserved jediný systém pro celý dům.
4. **Retenční engine** (#2): leaderboardy + challenges z docházky. Pro fitness/funkční segment velký retenční tah. (Měření tepu / wearables = mimo rozsah, neděláme.)
5. **Dynamické ceny lekcí** (#3) — střední úsilí, hezký pricing nástroj.
6. Síťové (#5–#7) a ClassPass/Reserve-with-Google = **obchodní krok první** (partnerské programy), pak integrace.

**Positioning, který z toho plyne:** „**Jeden systém pro celý tvůj cvičební dům — lekce, wellness, osobák, kurzy i vstup na čip, na jednu peněženku.**" To je věc, kterou ani Mindbody, ani Life Time, ani žádný porovnávaný hráč dnes nedává kompletně.
