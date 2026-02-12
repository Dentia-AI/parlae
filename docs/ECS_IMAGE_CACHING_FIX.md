# ECS Image Caching Fix

## Problem

When using Docker image tag `:latest`, ECS may cache the image even when using `--force-new-deployment`. This causes deployments to use old code even after pushing new changes.

### Symptoms

- GitHub Actions workflow shows successful deployment
- ECS task logs show old `gitCommit: "unknown"` and `cognitoDomain: "parlae-auth"`
- `/version` endpoint returns OLD build timestamp and git commit
- Code changes don't appear in production

## Root Cause

1. Docker builds image with `:latest` tag
2. Push to ECR overwrites `:latest` tag with new image
3. `--force-new-deployment` restarts ECS tasks
4. **BUT**: ECS may use cached `:latest` image if it was already pulled, because the tag name hasn't changed

## Solution

Use Git SHA as the image tag instead of `:latest`. This guarantees each build has a unique tag.

### Changes Made to `.github/workflows/deploy-frontend.yml`

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

### To Deploy the Fix

```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae

# 1. Stage the workflow changes
git add .github/workflows/deploy-frontend.yml

# 2. Commit
git commit -m "fix: Use Git SHA for Docker image tags to prevent ECS caching"

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
