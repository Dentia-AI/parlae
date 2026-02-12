# URGENT: Dockerfile Runner Stage Fix

## The Problem You're Experiencing

Even though you pushed the workflow changes and the image was built with Git SHA `56623ba`, the ECS container logs still show:

```json
{
  "gitCommit": "unknown",
  "cognitoDomain": "parlae-auth",
  "buildTimestamp": "unknown"
}
```

And Google sign-up and translations don't work.

## Root Cause

**Docker multi-stage builds don't carry ARG/ENV variables from the builder stage to the runner stage.**

Your Dockerfile has two stages:
1. **Builder stage** (`FROM node:20-slim AS builder`) - builds the Next.js app
2. **Runner stage** (`FROM node:20-slim AS runner`) - runs the production app

The build arguments like `GIT_COMMIT_SHA`, `BUILD_TIMESTAMP`, and `COGNITO_DOMAIN` were only declared in the **builder** stage. When Docker creates the **runner** stage with a fresh `FROM` instruction, these variables are lost.

### Visual Explanation

```dockerfile
# Builder Stage (lines 3-130)
FROM node:20-slim AS builder
ARG GIT_COMMIT_SHA=unknown          # ✅ Declared here
ENV GIT_COMMIT_SHA=$GIT_COMMIT_SHA  # ✅ Set here
# ... build happens ...

# Runner Stage (lines 131+) - FRESH START
FROM node:20-slim AS runner         # ❌ New stage, variables are gone!
# Missing: ARG GIT_COMMIT_SHA
# Missing: ENV GIT_COMMIT_SHA
# Result: process.env.GIT_COMMIT_SHA = undefined → "unknown"
```

## The Fix Applied

I've updated `infra/docker/frontend.Dockerfile` to re-declare ALL runtime-needed build arguments in the runner stage:

```dockerfile
FROM node:20-slim AS runner
WORKDIR /app
# ...

# Build metadata (must be re-declared in runner stage)
ARG GIT_COMMIT_SHA=unknown
ARG BUILD_TIMESTAMP=unknown
ENV GIT_COMMIT_SHA=$GIT_COMMIT_SHA
ENV BUILD_TIMESTAMP=$BUILD_TIMESTAMP

# Runtime Auth environment variables (must be re-declared in runner stage)
ARG COGNITO_CLIENT_ID=""
ARG COGNITO_CLIENT_SECRET=""
ARG COGNITO_ISSUER=""
ARG COGNITO_DOMAIN=""
ARG NEXTAUTH_SECRET=""
ARG NEXTAUTH_URL=""
ENV COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
ENV COGNITO_CLIENT_SECRET=$COGNITO_CLIENT_SECRET
ENV COGNITO_ISSUER=$COGNITO_ISSUER
ENV COGNITO_DOMAIN=$COGNITO_DOMAIN
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV NEXTAUTH_URL=$NEXTAUTH_URL

# ... rest of runner stage
```

## Deploy This Fix NOW

```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae

# Stage and commit
git add infra/docker/frontend.Dockerfile \
        .github/workflows/deploy-frontend.yml \
        docs/ECS_IMAGE_CACHING_FIX.md \
        DOCKERFILE_FIX_URGENT.md

git commit -m "fix: Re-declare build args in Dockerfile runner stage

Critical fix: Docker multi-stage builds don't inherit ARG/ENV from
previous stages. Re-declare GIT_COMMIT_SHA, BUILD_TIMESTAMP, and all
COGNITO_* variables in runner stage for runtime access.

Fixes:
- gitCommit showing 'unknown'
- cognitoDomain showing 'parlae-auth' instead of full domain
- Google OAuth redirect failing
- Translations not working"

# Push to trigger deployment
git push origin main
```

## After Deployment (~5 minutes)

Verify the fix worked:

```bash
# Check version endpoint
curl https://app.parlae.ca/version | jq .

# Should now show:
# {
#   "gitCommit": "<real-commit-sha>",
#   "buildTimestamp": "2026-02-12T...",
#   "cognitoDomain": "parlae-auth-2026.auth.us-east-2.amazoncognito.com"
# }
```

Then test:
1. ✅ Google Sign-Up button appears
2. ✅ Google OAuth redirect works (no `https://parlae-auth/` error)
3. ✅ Auth page layout text translates to French
4. ✅ Chat widget loads

## Why This Wasn't Caught Earlier

- The workflow was correctly passing build args: `--build-arg GIT_COMMIT_SHA=...`
- The Docker build succeeded without errors
- The **builder stage** had access to the variables during the build
- But the **runner stage** (what actually runs in ECS) never received them

This is a common gotcha in Docker multi-stage builds!
