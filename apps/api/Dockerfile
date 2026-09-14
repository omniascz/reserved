# Reserved API — produkční obraz.
#
# ── ZÁMĚRNĚ BEZ VAZBY NA POSKYTOVATELE ──────────────────────────────────────
# Obyčejný Node obraz, žádné specifické buildpacky. Spustí se na Hetzneru,
# u kohokoli jiného i lokálně. Rozhodnutí o hostingu se tím neuzavírá.
#
# ── ŽÁDNÁ DOMÉNA V OBRAZU ───────────────────────────────────────────────────
# API si všechny adresy bere z proměnných prostředí za běhu (APP_URL,
# API_URL, ADMIN_BASE_URL…). V obrazu není zadrátovaná žádná doména, takže
# stejný obraz běží na testovací i ostré doméně — mění se jen konfigurace.
#
# Build z KOŘENE repozitáře (kvůli pnpm workspace):
#   docker build -f apps/api/Dockerfile -t reserved-api .

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ── 1) Závislosti ───────────────────────────────────────────────────────────
# Kopírují se nejdřív jen manifesty, ať se vrstva s závislostmi nepřepočítává
# při každé změně zdrojáku.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/workers/package.json apps/workers/
COPY packages/db/package.json packages/db/
COPY packages/rls-multitenancy/package.json packages/rls-multitenancy/
COPY packages/rules-engine/package.json packages/rules-engine/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

# ── 2) Build ────────────────────────────────────────────────────────────────
#
# POZOR NA POŘADÍ KOPÍROVÁNÍ — tady byla chyba, která shodila první build:
# `COPY packages packages` PŘEPÍŠE celou složku včetně `node_modules`, které
# do ní nainstaloval předchozí krok. Balíčky pak nemají `tsc` a build skončí
# na `MODULE_NOT_FOUND`.
# Proto se kopírují jen ZDROJOVÉ soubory (`src`, konfigurace), ne celé složky.
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/types/src packages/types/src
COPY packages/types/tsconfig.json packages/types/
COPY packages/utils/src packages/utils/src
COPY packages/utils/tsconfig.json packages/utils/
COPY packages/rules-engine/src packages/rules-engine/src
COPY packages/rules-engine/tsconfig.json packages/rules-engine/
COPY packages/rls-multitenancy/src packages/rls-multitenancy/src
COPY packages/rls-multitenancy/tsconfig.json packages/rls-multitenancy/
COPY packages/db/src packages/db/src
COPY packages/db/drizzle packages/db/drizzle
COPY packages/db/tsconfig.json packages/db/drizzle.config.ts packages/db/
COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/nest-cli.json apps/api/
# turbo sestaví i všechny @reserved/* balíčky, na kterých API stojí.
RUN pnpm turbo run build --filter=@reserved/api

# ── 3) Běh ──────────────────────────────────────────────────────────────────
# Instalují se jen produkční závislosti — do obrazu nepatří typescript,
# vitest ani nic dalšího z vývoje.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/packages packages
# `--ignore-scripts`: kořenový `prepare` spouští husky (git hooky pro vývoj),
# které v produkční instalaci nejsou — bez tohohle build spadne na
# „husky: not found".
#
# Nativní balíček argon2 (hashování hesel) přeskočení skriptů snese, protože
# má předkompilované binárky pro linux-x64 i linux-arm64. Kdyby je neměl,
# API by se nenastartovalo vůbec — modul se načítá při startu, ne až při
# prvním přihlášení. Proto se po sestavení VŽDY ověřuje spuštěním kontejneru
# a dotazem na /api/v1/health; samotný úspěšný build nic neříká o běhu.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @reserved/api...
COPY --from=build /app/apps/api/dist apps/api/dist

# Neprivilegovaný uživatel — kdyby se někdo dostal dovnitř, ať není root.
USER node

EXPOSE 4010

# Kontejner se sám prohlásí za nezdravý, když API neodpovídá. Orchestrátor
# (compose, systemd, cokoli) to pozná bez dalšího nastavování.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4010)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
