# Reserved workers — produkční obraz.
#
# Workers běží jako SAMOSTATNÝ kontejner, ne uvnitř API. Důvod: restart API
# (nasazení, pád) nesmí přerušit rozdělanou frontu, a naopak zaseknutý poller
# nesmí shodit obsluhu požadavků. Je to i doporučení produkčního checklistu.
#
# Build z KOŘENE repozitáře:
#   docker build -f apps/workers/Dockerfile -t reserved-workers .

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

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

# POZOR NA POŘADÍ: `COPY packages packages` by přepsalo `node_modules`
# nainstalované v předchozím kroku a balíčky by přišly o `tsc`
# (MODULE_NOT_FOUND). Kopírují se proto jen zdrojové soubory.
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
COPY apps/workers/src apps/workers/src
COPY apps/workers/tsconfig.json apps/workers/
RUN pnpm turbo run build --filter=@reserved/workers

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/workers/package.json apps/workers/
COPY --from=build /app/packages packages
# `--ignore-scripts`: kořenový `prepare` spouští husky (git hooky pro vývoj),
# které v produkční instalaci nejsou — jinak build spadne na „husky: not found".
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @reserved/workers...
COPY --from=build /app/apps/workers/dist apps/workers/dist

USER node

# Workers neposlouchají na portu, takže klasický HTTP healthcheck nedává smysl.
# Kontrolu živosti řeší restart policy orchestrátoru: proces buď běží, nebo ne.

WORKDIR /app/apps/workers
CMD ["node", "dist/main.js"]
