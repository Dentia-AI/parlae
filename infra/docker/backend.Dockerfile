# syntax=docker/dockerfile:1

FROM node:20-slim AS builder
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && pnpm config set store-dir /app/.pnpm-store

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy workspace manifests first so dependency installation stays cached
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY apps/frontend/apps/web/package.json apps/frontend/apps/web/
COPY apps/frontend/packages/billing/core/package.json apps/frontend/packages/billing/core/
COPY apps/frontend/packages/billing/gateway/package.json apps/frontend/packages/billing/gateway/
COPY apps/frontend/packages/billing/stripe/package.json apps/frontend/packages/billing/stripe/
COPY apps/frontend/packages/cms/core/package.json apps/frontend/packages/cms/core/
COPY apps/frontend/packages/cms/keystatic/package.json apps/frontend/packages/cms/keystatic/
COPY apps/frontend/packages/cms/types/package.json apps/frontend/packages/cms/types/
COPY apps/frontend/packages/cms/wordpress/package.json apps/frontend/packages/cms/wordpress/
COPY apps/frontend/packages/email-templates/package.json apps/frontend/packages/email-templates/
COPY apps/frontend/packages/features/accounts/package.json apps/frontend/packages/features/accounts/
COPY apps/frontend/packages/i18n/package.json apps/frontend/packages/i18n/
COPY apps/frontend/packages/mailers/core/package.json apps/frontend/packages/mailers/core/
COPY apps/frontend/packages/mailers/nodemailer/package.json apps/frontend/packages/mailers/nodemailer/
COPY apps/frontend/packages/mailers/resend/package.json apps/frontend/packages/mailers/resend/
COPY apps/frontend/packages/mailers/shared/package.json apps/frontend/packages/mailers/shared/
COPY apps/frontend/packages/monitoring/api/package.json apps/frontend/packages/monitoring/api/
COPY apps/frontend/packages/monitoring/core/package.json apps/frontend/packages/monitoring/core/
COPY apps/frontend/packages/monitoring/sentry/package.json apps/frontend/packages/monitoring/sentry/
COPY apps/frontend/packages/next/package.json apps/frontend/packages/next/
COPY apps/frontend/packages/policies/package.json apps/frontend/packages/policies/
COPY apps/frontend/packages/shared/package.json apps/frontend/packages/shared/
COPY apps/frontend/packages/ui/package.json apps/frontend/packages/ui/
COPY packages/prisma/package.json packages/prisma/
COPY packages/prisma/schema.prisma packages/prisma/

RUN --mount=type=cache,id=pnpm-store-backend,target=/app/.pnpm-store \
  pnpm install --filter @apps/backend... --filter @kit/prisma...

COPY apps ./apps
COPY packages ./packages
# Prisma client is generated during install via postinstall script
RUN pnpm --filter @apps/backend build

FROM node:20-slim AS runner
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && pnpm config set store-dir /app/.pnpm-store
ENV NODE_ENV=production

COPY --from=builder /app /app

# Ensure Prisma binaries are accessible
# (They should already be in /app from the builder stage copy above)

# Copy migration entrypoint script
COPY scripts/migrate-and-start.sh /app/migrate-and-start.sh
RUN chmod +x /app/migrate-and-start.sh

EXPOSE 4000

# Use migration script as entrypoint, pass original CMD as arguments
ENTRYPOINT ["/app/migrate-and-start.sh"]
CMD ["node", "apps/backend/dist/apps/backend/src/main.js"]
