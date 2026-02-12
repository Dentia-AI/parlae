# ECS Image Caching Fix

## Problem

When using Docker image tag `:latest`, ECS may cache the image even when using `--force-new-deployment`. This causes deployments to use old code even after pushing new changes.

### Symptoms

- GitHub Actions workflow shows successful deployment
- ECS task logs show old `gitCommit: "unknown"` and `cognitoDomain: "parlae-auth"`
- `/version` endpoint returns OLD build timestamp and git commit
- Code changes don't appear in production

## Root Causes

### Issue 1: Docker Image Tag Caching

1. Docker builds image with `:latest` tag
2. Push to ECR overwrites `:latest` tag with new image
3. `--force-new-deployment` restarts ECS tasks
4. **BUT**: ECS may use cached `:latest` image if it was already pulled, because the tag name hasn't changed

### Issue 2: Multi-Stage Dockerfile ENV Variables Not Propagating

Build arguments (`ARG`) and environment variables (`ENV`) set in the **builder** stage don't automatically carry over to the **runner** stage in multi-stage Docker builds. The Dockerfile had:

```dockerfile
# Builder stage
ARG GIT_COMMIT_SHA=unknown
ENV GIT_COMMIT_SHA=$GIT_COMMIT_SHA

# Runner stage (NEW STAGE - variables don't carry over!)
FROM node:20-slim AS runner
# Missing: ARG and ENV declarations for GIT_COMMIT_SHA
```

This caused the runtime container to show `"gitCommit": "unknown"` and `"cognitoDomain": "parlae-auth"` even though the build args were passed correctly.

## Solution

### Fix 1: Use Git SHA for Image Tags

Use Git SHA as the image tag instead of `:latest`. This guarantees each build has a unique tag.

### Fix 2: Re-declare Build Args in Runner Stage

Add `ARG` and `ENV` declarations for all runtime-needed variables in the Dockerfile's runner stage.

## Changes Made

### 1. `.github/workflows/deploy-frontend.yml`

```yaml
# Before
IMAGE_URI="${ECR_REGISTRY}/${ECR_REPOSITORY_NAME}:latest"

# After
GIT_SHA_SHORT=$(git rev-parse --short HEAD)
IMAGE_URI="${ECR_REGISTRY}/${ECR_REPOSITORY_NAME}:${GIT_SHA_SHORT}"
IMAGE_URI_LATEST="${ECR_REGISTRY}/${ECR_REPOSITORY_NAME}:latest"
```

The workflow now:
1. Tags image with both Git SHA (e.g., `abc1234`) AND `:latest`
2. Updates ECS task definition to use the Git SHA tagged image
3. Forces ECS deployment with the new task definition

### 2. `infra/docker/frontend.Dockerfile`

Added ARG and ENV declarations to the **runner stage** for all runtime-needed variables:

```dockerfile
FROM node:20-slim AS runner
WORKDIR /app
# ... apt-get setup ...

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

# ... rest of runner stage ...
```

**Critical**: In multi-stage Docker builds, each `FROM` instruction starts a fresh stage. ARG and ENV variables from previous stages are NOT inherited and must be re-declared.

## To Deploy the Fix

```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae

# 1. Stage the changes
git add .github/workflows/deploy-frontend.yml \
        infra/docker/frontend.Dockerfile \
        docs/ECS_IMAGE_CACHING_FIX.md

# 2. Commit
git commit -m "fix: Docker multi-stage build args and Git SHA image tags

- Re-declare build args in runner stage for runtime access
- Use Git SHA for image tags to prevent ECS caching
- Fixes: gitCommit unknown, cognitoDomain truncated, auth/translate issues"

# 3. Push to trigger deployment
git push origin main
```

### Verification

After deployment completes (~5 minutes), check:

```bash
# Check the version endpoint
curl https://app.parlae.ca/version | jq .

# Should show:
# - gitCommit: "<actual-commit-sha>"  (not "unknown")
# - buildTimestamp: "<actual-timestamp>"  (not "unknown")
# - cognitoDomain: "parlae-auth-2026.auth.us-east-2.amazoncognito.com"  (not "parlae-auth")
```

## Technical Details

### Why This Happens

Docker image tags are just labels pointing to image digests. When you:
1. Build image with tag `myrepo:latest` → digest `sha256:abc123...`
2. Push to ECR
3. Build NEW image with tag `myrepo:latest` → digest `sha256:def456...`
4. Push to ECR (overwrites the `latest` tag)

ECS sees the same tag name (`:latest`) and may use its cached image instead of pulling the new digest.

### Why Git SHA Tags Fix This

Each commit has a unique SHA, so:
- Commit 1: `myrepo:a1b2c3d`
- Commit 2: `myrepo:e4f5g6h`

ECS sees a **different tag name** and is forced to pull the new image.

## Related Issues

- Google OAuth redirect failing → Fixed by correct `COGNITO_DOMAIN`
- Chat widget not loading → Fixed by `GHL_*` build args
- Translations not working → Fixed by `withI18n` wrapper and translation JSON files

All these fixes are in the latest code, but may not be deployed due to image caching.
