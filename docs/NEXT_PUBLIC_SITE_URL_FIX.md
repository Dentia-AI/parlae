# NEXT_PUBLIC_SITE_URL Fix

## Issue

Build was failing with Zod validation error:

```
Error [ZodError]: [
  {
    "code": "custom",
    "message": "Please provide a valid HTTPS URL. Set the variable NEXT_PUBLIC_SITE_URL with a valid URL, such as: 'https://example.com'",
    "path": ["url"]
  }
]
```

## Root Cause

The `app.config.ts` file validates `NEXT_PUBLIC_SITE_URL` with these rules:

1. **Base validation**: Must be a valid URL format
2. **HTTPS validation**: In production builds, the URL must start with `https://` (not `http://`)
3. **Escape hatch**: The HTTPS check can be bypassed if `NEXT_PUBLIC_CI` environment variable is set

```typescript
.refine(
  (schema) => {
    const isCI = process.env.NEXT_PUBLIC_CI;
    
    if (isCI ?? !schema.production) {
      return true;
    }
    
    return !schema.url.startsWith('http:');
  },
  {
    message: `Please provide a valid HTTPS URL...`,
    path: ['url'],
  },
)
```

## Solution

### 1. CI Workflows Updated

Added `NEXT_PUBLIC_CI: true` to bypass HTTPS validation in CI builds:

**Files:** `.github/workflows/test-frontend.yml`, `.github/workflows/test-all.yml`

```yaml
- name: Build frontend
  run: pnpm --filter web build
  env:
    NODE_ENV: production
    NEXT_PUBLIC_CI: true                    # ✅ Added to bypass HTTPS check
    NEXT_PUBLIC_SITE_URL: https://app.parlae.ca  # ✅ Changed from http://localhost
    NEXT_PUBLIC_PRODUCT_NAME: Parlae
    NEXT_PUBLIC_SITE_TITLE: Parlae
    NEXT_PUBLIC_SITE_DESCRIPTION: AI Voice Agent Platform
    COGNITO_CLIENT_ID: dummy-client-id-for-build
    COGNITO_CLIENT_SECRET: dummy-client-secret-for-build
    COGNITO_ISSUER: https://cognito-idp.us-east-2.amazonaws.com/dummy-pool
    NEXTAUTH_SECRET: dummy-nextauth-secret-for-build-only
    NEXTAUTH_URL: https://app.parlae.ca
```

### 2. Dockerfile Defaults Fixed

**File:** `infra/docker/frontend.Dockerfile`

**Changes:**
- Fixed product name from "Dentia" → "Parlae"
- Updated description to match actual product
- Changed default URL from `https://www.parlae.ca` → `https://app.parlae.ca`
- Updated Cognito region from us-east-1 → us-east-2
- Updated NEXTAUTH_URL to match SITE_URL

```dockerfile
# Build arguments with defaults for production
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."
ARG NEXT_PUBLIC_PRODUCT_NAME="Parlae"                      # ✅ Fixed from "Dentia"
ARG NEXT_PUBLIC_SITE_TITLE="Parlae"
ARG NEXT_PUBLIC_SITE_DESCRIPTION="AI Voice Agent Platform"  # ✅ Updated description
ARG NEXT_PUBLIC_SITE_URL="https://app.parlae.ca"           # ✅ Changed from www.parlae.ca
ARG NEXT_PUBLIC_DEFAULT_LOCALE="en"
ARG NEXT_PUBLIC_DEFAULT_THEME_MODE="system"
ARG NEXT_PUBLIC_THEME_COLOR="#FAFAFA"
ARG NEXT_PUBLIC_THEME_COLOR_DARK="#0A0A0A"

# Auth build arguments
ARG COGNITO_CLIENT_ID="dummy-client-id-for-docker-build"
ARG COGNITO_CLIENT_SECRET="dummy-client-secret-for-docker-build"
ARG COGNITO_ISSUER="https://cognito-idp.us-east-2.amazonaws.com/dummy-pool-for-build"  # ✅ Fixed region
ARG NEXTAUTH_SECRET="dummy-nextauth-secret-minimum-32-characters-required-for-build"
ARG NEXTAUTH_URL="https://app.parlae.ca"  # ✅ Changed from www.parlae.ca
```

### 3. Deployment Workflow Updated

**File:** `.github/workflows/deploy-frontend.yml`

**Changes:**
- Added explicit `NEXT_PUBLIC_*` build arguments to ensure production deployment uses correct values

```yaml
- name: Build and push image
  run: |
    IMAGE_URI="${ECR_REGISTRY}/${ECR_REPOSITORY_NAME}:latest"
    docker buildx build \
      --platform linux/amd64 \
      --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="${{ secrets.STRIPE_PUBLISHABLE_KEY_PROD }}" \
      --build-arg NEXT_PUBLIC_PRODUCT_NAME="Parlae" \              # ✅ Added
      --build-arg NEXT_PUBLIC_SITE_TITLE="Parlae" \                # ✅ Added
      --build-arg NEXT_PUBLIC_SITE_DESCRIPTION="AI Voice Agent Platform" \  # ✅ Added
      --build-arg NEXT_PUBLIC_SITE_URL="https://app.parlae.ca" \   # ✅ Added
      --build-arg COGNITO_CLIENT_ID="${{ secrets.COGNITO_CLIENT_ID }}" \
      --build-arg COGNITO_CLIENT_SECRET="${{ secrets.COGNITO_CLIENT_SECRET }}" \
      --build-arg COGNITO_ISSUER="${{ secrets.COGNITO_ISSUER }}" \
      --build-arg NEXTAUTH_SECRET="${{ secrets.NEXTAUTH_SECRET }}" \
      --build-arg NEXTAUTH_URL="https://app.parlae.ca" \           # ✅ Changed from www
      -t "$IMAGE_URI" \
      -f infra/docker/frontend.Dockerfile \
      --push \
      .
```

## Why This Works

### For CI Builds:
1. `NEXT_PUBLIC_CI: true` is set in the environment
2. The `app.config.ts` validation detects this and **bypasses** the HTTPS requirement
3. Build succeeds even with dummy Cognito values
4. Tests can run successfully

### For Production Deployment:
1. `NEXT_PUBLIC_CI` is **not** set (intentionally)
2. `NEXT_PUBLIC_SITE_URL` is set to `https://app.parlae.ca` (valid HTTPS URL)
3. Validation passes because URL starts with `https://`
4. Real Cognito secrets are used from GitHub Secrets
5. Production deployment succeeds with proper configuration

## Environment Variables Summary

### Required `NEXT_PUBLIC_*` Variables (for build):
- `NEXT_PUBLIC_PRODUCT_NAME` - Product name (displays in UI)
- `NEXT_PUBLIC_SITE_TITLE` - Default page title
- `NEXT_PUBLIC_SITE_DESCRIPTION` - Default meta description
- `NEXT_PUBLIC_SITE_URL` - **Must be HTTPS in production**
- `NEXT_PUBLIC_DEFAULT_LOCALE` - Default language (defaults to "en")
- `NEXT_PUBLIC_DEFAULT_THEME_MODE` - Theme mode (defaults to "system")
- `NEXT_PUBLIC_THEME_COLOR` - Light theme color (defaults to "#FAFAFA")
- `NEXT_PUBLIC_THEME_COLOR_DARK` - Dark theme color (defaults to "#0A0A0A")

### Optional CI Bypass:
- `NEXT_PUBLIC_CI` - Set to `true` to bypass HTTPS validation in CI environments

### Auth Variables (runtime):
- `COGNITO_CLIENT_ID` - Cognito app client ID
- `COGNITO_CLIENT_SECRET` - Cognito app client secret
- `COGNITO_ISSUER` - Cognito issuer URL
- `NEXTAUTH_SECRET` - NextAuth.js secret (min 32 chars)
- `NEXTAUTH_URL` - NextAuth.js callback URL

## URL Consistency

All URLs now consistently use `https://app.parlae.ca`:
- ✅ CI workflows
- ✅ Dockerfile defaults
- ✅ Deployment workflow
- ✅ NEXTAUTH_URL matches SITE_URL

Previous inconsistency:
- ❌ Some places used `https://www.parlae.ca`
- ❌ Some places used `http://localhost:3000`
- ❌ Some places used wrong region (us-east-1 instead of us-east-2)

## Verification

### Check CI Build:
```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae
git push origin main
gh run watch
```

### Check Environment Variables in Workflow:
```bash
gh run view --log | grep "NEXT_PUBLIC"
```

### Check Built Configuration:
After deployment, the app config should have:
```javascript
{
  name: "Parlae",
  title: "Parlae",
  description: "AI Voice Agent Platform",
  url: "https://app.parlae.ca",
  // ... other config
}
```

## Files Modified

```
M  .github/workflows/deploy-frontend.yml  (+ NEXT_PUBLIC_* build args)
M  .github/workflows/test-all.yml         (+ NEXT_PUBLIC_CI, + https URL)
M  .github/workflows/test-frontend.yml    (+ NEXT_PUBLIC_CI, + https URL)
M  infra/docker/frontend.Dockerfile       (fix product name, URL, region)
```

## Related Documentation

- [CI_CD_IMPROVEMENTS.md](./CI_CD_IMPROVEMENTS.md) - Overall CI/CD pipeline
- [DOCKER_BUILD_ENV_VARS.md](./DOCKER_BUILD_ENV_VARS.md) - Environment variable handling
- [DEPLOYMENT_READY.md](./DEPLOYMENT_READY.md) - Deployment checklist

## Next Steps

Once these changes are pushed:
1. ✅ CI build will pass (NEXT_PUBLIC_CI bypasses HTTPS check)
2. ✅ Tests will run successfully
3. ✅ Deployment will use correct production URLs
4. ✅ App will display correct product name and metadata

---

**Last Updated:** 2026-02-11  
**Status:** ✅ Fixed  
**Issue:** Zod validation requiring HTTPS URL  
**Solution:** Added NEXT_PUBLIC_CI flag + corrected all URLs to https://app.parlae.ca
