# syntax=docker/dockerfile:1

FROM node:20-slim AS builder
WORKDIR /app

# Build arguments with defaults for production
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_51SNPE0F4uIWy4U8OvsQDnJmMEAUBNuBbtqYBvkUWPZ7NNuThT4t08xYnf08w7ZInw3HzbRS2HOG1PLDmytLERxUg00yIFu29Tn"
ARG NEXT_PUBLIC_PRODUCT_NAME="Parlae"
ARG NEXT_PUBLIC_SITE_TITLE="Parlae"
ARG NEXT_PUBLIC_SITE_DESCRIPTION="AI Voice Agent Platform"
ARG NEXT_PUBLIC_SITE_URL="https://www.parlae.ca"
ARG NEXT_PUBLIC_DEFAULT_LOCALE="en"
ARG NEXT_PUBLIC_DEFAULT_THEME_MODE="system"
ARG NEXT_PUBLIC_THEME_COLOR="#FAFAFA"
ARG NEXT_PUBLIC_THEME_COLOR_DARK="#0A0A0A"
# App hosts for routing
ARG APP_HOSTS="app.parlae.ca"
ARG MARKETING_HOSTS="www.parlae.ca,parlae.ca"
# Feature flags
ARG NEXT_PUBLIC_ENABLE_THEME_TOGGLE="true"
ARG NEXT_PUBLIC_ENABLE_PERSONAL_ACCOUNT_DELETION="false"
ARG NEXT_PUBLIC_ENABLE_PERSONAL_ACCOUNT_BILLING="true"
ARG NEXT_PUBLIC_LANGUAGE_PRIORITY="user"
ARG NEXT_PUBLIC_ENABLE_VERSION_UPDATER="false"
# AWS/S3 (will be overridden at runtime via ECS task definition)
ARG AWS_REGION="us-east-2"
ARG S3_BUCKET_NAME="parlae-uploads"
ARG S3_PUBLIC_BASE_URL=""
# GoHighLevel build arguments
ARG NEXT_PUBLIC_GHL_WIDGET_ID
ARG NEXT_PUBLIC_GHL_LOCATION_ID
ARG NEXT_PUBLIC_GHL_CALENDAR_ID
# Auth build arguments (dummy values for build - real values set at runtime)
ARG COGNITO_CLIENT_ID="dummy-client-id-for-docker-build"
ARG COGNITO_CLIENT_SECRET="dummy-client-secret-for-docker-build"
ARG COGNITO_ISSUER="https://cognito-idp.us-east-2.amazonaws.com/dummy-pool-for-build"
ARG NEXTAUTH_SECRET="dummy-nextauth-secret-minimum-32-characters-required-for-build"
ARG NEXTAUTH_URL="https://app.parlae.ca"
# Build metadata
ARG GIT_COMMIT_SHA=unknown
ARG BUILD_TIMESTAMP=unknown

# Set environment variables from build args
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_PRODUCT_NAME=$NEXT_PUBLIC_PRODUCT_NAME
ENV NEXT_PUBLIC_SITE_TITLE=$NEXT_PUBLIC_SITE_TITLE
ENV NEXT_PUBLIC_SITE_DESCRIPTION=$NEXT_PUBLIC_SITE_DESCRIPTION
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE
ENV NEXT_PUBLIC_DEFAULT_THEME_MODE=$NEXT_PUBLIC_DEFAULT_THEME_MODE
ENV NEXT_PUBLIC_THEME_COLOR=$NEXT_PUBLIC_THEME_COLOR
ENV NEXT_PUBLIC_THEME_COLOR_DARK=$NEXT_PUBLIC_THEME_COLOR_DARK
# App hosts for routing
ENV APP_HOSTS=$APP_HOSTS
ENV MARKETING_HOSTS=$MARKETING_HOSTS
# Feature flags
ENV NEXT_PUBLIC_ENABLE_THEME_TOGGLE=$NEXT_PUBLIC_ENABLE_THEME_TOGGLE
ENV NEXT_PUBLIC_ENABLE_PERSONAL_ACCOUNT_DELETION=$NEXT_PUBLIC_ENABLE_PERSONAL_ACCOUNT_DELETION
ENV NEXT_PUBLIC_ENABLE_PERSONAL_ACCOUNT_BILLING=$NEXT_PUBLIC_ENABLE_PERSONAL_ACCOUNT_BILLING
ENV NEXT_PUBLIC_LANGUAGE_PRIORITY=$NEXT_PUBLIC_LANGUAGE_PRIORITY
ENV NEXT_PUBLIC_ENABLE_VERSION_UPDATER=$NEXT_PUBLIC_ENABLE_VERSION_UPDATER
# AWS/S3
ENV AWS_REGION=$AWS_REGION
ENV S3_BUCKET_NAME=$S3_BUCKET_NAME
ENV S3_PUBLIC_BASE_URL=$S3_PUBLIC_BASE_URL
# GoHighLevel environment variables
ENV NEXT_PUBLIC_GHL_WIDGET_ID=$NEXT_PUBLIC_GHL_WIDGET_ID
ENV NEXT_PUBLIC_GHL_LOCATION_ID=$NEXT_PUBLIC_GHL_LOCATION_ID
ENV NEXT_PUBLIC_GHL_CALENDAR_ID=$NEXT_PUBLIC_GHL_CALENDAR_ID
# Auth environment variables (dummy values for build only)
ENV COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
ENV COGNITO_CLIENT_SECRET=$COGNITO_CLIENT_SECRET
ENV COGNITO_ISSUER=$COGNITO_ISSUER
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV NEXTAUTH_URL=$NEXTAUTH_URL
# Build metadata
ENV GIT_COMMIT_SHA=$GIT_COMMIT_SHA
ENV BUILD_TIMESTAMP=$BUILD_TIMESTAMP

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

RUN --mount=type=cache,id=pnpm-store-frontend,target=/app/.pnpm-store \
  pnpm install --filter web... --filter @kit/prisma...

COPY apps ./apps
COPY packages ./packages
# Prisma client is generated during install via postinstall script
RUN --mount=type=cache,id=next-build-cache,target=/app/apps/frontend/apps/web/.next/cache \
  pnpm --filter web build

FROM node:20-slim AS runner
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/apps/web/.next/static ./apps/frontend/apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/apps/web/public ./apps/frontend/apps/web/public

# Copy Prisma package for migrations
COPY --from=builder --chown=nextjs:nodejs /app/packages/prisma ./packages/prisma

# Copy all Prisma-related packages from .pnpm store (version-agnostic)
# This copies prisma CLI, @prisma/client, @prisma/engines regardless of version
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.modules.yaml ./node_modules/.modules.yaml

# NOTE: Cleanup commented out as it was deleting required packages like 'next'
# The standalone build should handle optimization
# Clean up non-Prisma packages to reduce image size (optional - comment out if issues arise)
# RUN cd /app/node_modules/.pnpm && \
#     find . -mindepth 1 -maxdepth 1 -type d ! -name 'prisma@*' ! -name '@prisma+*' ! -name 'node_modules' -exec rm -rf {} + || true

# Copy migration entrypoint script
COPY --chown=nextjs:nodejs scripts/migrate-and-start.sh /app/migrate-and-start.sh
RUN chmod +x /app/migrate-and-start.sh

USER nextjs

EXPOSE 3000

# Use migration script as entrypoint, pass original CMD as arguments
ENTRYPOINT ["/app/migrate-and-start.sh"]
CMD ["node", "apps/frontend/apps/web/server.js"]
