# Skupina C — co je hotové a co potřebuje TVOJE účty/klíče

> Skupina C = věci, které **fyzicky nejde dokončit ani ověřit bez reálných účtů,
> klíčů nebo partnerských smluv**. Nebudu předstírat, že fungují, dokud to
> neproběhne naživo. Níže přesně: co už je nakódované a čeká, co dodat.

## ✅ Z C už HOTOVÉ (postavitelné bez účtů, ověřeno)

- **PWA** — klientský portál je instalovatelný („přidat na plochu"): manifest,
  service worker, registrace. (Pro plnou instalaci na Androidu dodat PNG ikony
  192×512 — grafický asset.)
- **Stripe Connect OAuth flow** — kód kompletní (authorize URL + callback s
  výměnou kódu, CSRF state). **Naběhne, jakmile nastavíš env** (viz níže).

---

## ⚫ Čeká na TEBE — co dodat u každé položky

### 1. Stripe Connect (platby koncových klientů, 0 % fee)

Kód hotový, chybí jen klíče platformy:

- `STRIPE_CONNECT_CLIENT_ID` (z Stripe Dashboard → Connect → Settings)
- `STRIPE_SECRET_KEY` (platformní secret pro výměnu OAuth kódu)
- `API_PUBLIC_URL` (veřejná URL API pro redirect_uri)
  → Dodáš klíče → onboarding přes Stripe je hotový (otestujeme v Stripe test mode).

### 2. České platební brány — reálné transakce

Konektory (Comgate, ThePay, PayU, GP webpay) jsou nakódované, ale **podpisy se
musí ověřit proti sandboxu** každé brány. Potřebuju **testovací/sandbox účet**
u těch, které chceš spustit (stačí ty, co reálně použiješ):

- Comgate: merchant ID + secret (sandbox) — _nejjednodušší, doporučuju první_
- ThePay: projectId + apiPassword (demo)
- PayU: POS ID + secret (sandbox)
- GP webpay: merchant number + podpisový certifikát (test)
  → S přístupy doladím podpisy a ověřím reálnou platbu + webhook.

### 3. Zoom / Teams meeting odkazy

Jitsi funguje bez účtu (už máme). Zoom/Teams generování odkazů potřebuje
**OAuth aplikaci**:

- Zoom: Server-to-Server OAuth app (account ID + client ID/secret)
- Teams: Azure AD app registration (tenant + client ID/secret)
  → Dodáš → doplním generování odkazů.

### 4. Reserve-with-Google / OTA kanály / ClassPass

Tohle nejsou jen klíče — jsou to **partnerské programy se schvalováním**:

- Reserve-with-Google: přihláška do programu + onboarding partnera
- OTA (Booking.com/Expedia pro hotely): přes channel-manager (Channex/SiteMinder) — placená integrace
- ClassPass: partnerská smlouva + jejich API přístup
  → Tady je první krok **obchodní** (přihlásit se), ne technický. Až bude přístup,
  postavím adaptér.

### 5. Nativní mobilní aplikace

Samostatný projekt (React Native/Expo) + **účty v App Store ($99/rok) a Google
Play ($25)**. Není to feature do stávajícího kódu, je to nový build. Web/PWA
mezitím pokrývá „appku na ploše".

### 6. Saved-card / tichý strh z karty (off-session)

Pro tichý strh storno/no-show poplatku bez interakce klienta je potřeba
**uložení karty přes reálnou bránu** (tokenizace, PCI flow). Vyžaduje bod 1
nebo 2 živě. Dnes místo toho posíláme klientovi odkaz k úhradě (funguje).

---

## Doporučené pořadí (nejrychlejší hodnota)

1. **Comgate sandbox** (nejjednodušší CZ brána) → reálné platby naživo.
2. **Stripe Connect klíče** → platby koncových klientů + 0 % fee model.
3. Zbytek dle obchodní priority (Zoom/Teams, pak partnerské sítě).

Dej mi přístupy k bodu 1 nebo 2 a hned to dotáhnu do živého běhu.
