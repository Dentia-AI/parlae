# Complete Environment Variables Reference

## Status: ✅ ALL Required Variables Configured for CI/CD

This document lists ALL environment variables required for the Parlae application to build and run successfully.

## Build-Time vs Runtime Variables

### Build-Time Variables
These must be set during `next build` and are baked into the JavaScript bundle:
- All `NEXT_PUBLIC_*` variables
- `COGNITO_*` (for NextAuth.js config validation)
- `NEXTAUTH_SECRET` (for NextAuth.js config validation)
- `S3_BUCKET_NAME` (module-level validation bypassed in CI)
- `AWS_REGION` (module-level validation bypassed in CI)

### Runtime-Only Variables
These can be set at container runtime and don't affect the build:
- Database credentials
- API keys (Stripe secret, Vapi, etc.)
- Email service credentials

---

## Required Environment Variables

### 1. App Configuration (`app.config.ts`)

**Required** for build to succeed:

```bash
# Product identity
NEXT_PUBLIC_PRODUCT_NAME="Parlae"                 # ✅ Product name
NEXT_PUBLIC_SITE_TITLE="Parlae"                   # ✅ Default page title  
NEXT_PUBLIC_SITE_DESCRIPTION="AI Voice Agent Platform"  # ✅ Meta description
NEXT_PUBLIC_SITE_URL="https://www.parlae.ca"      # ✅ Must be HTTPS in production
NEXT_PUBLIC_DEFAULT_LOCALE="en"                   # ✅ Default language

# Theme
NEXT_PUBLIC_DEFAULT_THEME_MODE="system"           # ✅ light | dark | system
NEXT_PUBLIC_THEME_COLOR="#FAFAFA"                 # ✅ Light theme color
NEXT_PUBLIC_THEME_COLOR_DARK="#0A0A0A"            # ✅ Dark theme color
```

**Validation Logic:**
- `NEXT_PUBLIC_SITE_URL` must be HTTPS unless `NEXT_PUBLIC_CI=true` is set
- All string fields require `min(1)` characters

---

### 2. Feature Flags (`feature-flags.config.ts`)

**Required** for build to succeed:

```bash
NEXT_PUBLIC_ENABLE_THEME_TOGGLE="true"                    # ✅ Show theme toggle UI
NEXT_PUBLIC_ENABLE_PERSONAL_ACCOUNT_DELETION="false"      # ✅ Allow account deletion
NEXT_PUBLIC_ENABLE_PERSONAL_ACCOUNT_BILLING="true"        # ✅ Enable billing features
NEXT_PUBLIC_LANGUAGE_PRIORITY="user"                      # ✅ user | application
NEXT_PUBLIC_ENABLE_VERSION_UPDATER="false"                # ✅ Show update notifications
```

**Validation Logic:**
- All are required (no defaults)
- `NEXT_PUBLIC_LANGUAGE_PRIORITY` must be either `"user"` or `"application"`

---

### 3. Authentication (`nextauth.ts`)

**Required** for build to succeed:

```bash
# Cognito
COGNITO_CLIENT_ID="389m79tk1dhn1v5122ivajamdm"                          # ✅ From AWS SSM
COGNITO_CLIENT_SECRET="1bmsbfmqen79dl1a4dlpfk0k4k9gq6c0l7k23rpqsbonhddgcpcp"  # ✅ From AWS SSM
COGNITO_ISSUER="https://cognito-idp.us-east-2.amazonaws.com/us-east-2_DiKONDdME"  # ✅ From AWS SSM

# NextAuth.js
NEXTAUTH_SECRET="U2o4NT8jE2HuzVnNWYyCYo0PEZXx69CkzFIbpQaOkpo="           # ✅ From AWS SSM (min 32 chars)
NEXTAUTH_URL="https://app.parlae.ca"                                     # ✅ Auth callback URL
```

**Validation Logic:**
- Module-level validation throws error if not set
- Bypass: Check for dummy values (e.g., "dummy-client-id-for-build")
- In CI: Use dummy values, real values only in production deployment

---

### 5. CMS / Content Management (Optional)

**Optional** - Used for blog posts and documentation:

```bash
CMS_CLIENT=""                           # ✅ "keystatic" | "wordpress" | "" (empty = no CMS)
```

**Validation Logic:**
- If empty or not set, sitemap generation skips CMS content
- If set to "keystatic" or "wordpress", must have CMS properly configured
- Sitemap route gracefully handles missing CMS

---

### 6. AWS / S3 Storage (`app/api/uploads/presign/route.ts`)

**Required** for build to succeed (validation bypassed in CI):

```bash
AWS_REGION="us-east-2"                          # ✅ AWS region
S3_BUCKET_NAME="parlae-uploads"                 # ✅ S3 bucket for user uploads
S3_PUBLIC_BASE_URL=""                           # Optional: CDN URL for public access
```

**Validation Logic:**
- Module-level check: `throw new Error('S3_BUCKET_NAME is not configured')`
- **Fixed**: Now bypassed during build if `NEXT_PUBLIC_CI=true` or `NEXT_PHASE=phase-production-build`
- Runtime check: Returns 503 error if S3 not configured when API is called

---

### 7. CI/CD Control Variables

```bash
NEXT_PUBLIC_CI="true"         # ✅ Bypass HTTPS validation and S3 checks in CI
NODE_ENV="production"         # ✅ Enable production optimizations
```

---

## Environment Variable Strategy

### CI Builds (test-frontend.yml, test-all.yml)

Uses **dummy values** for sensitive credentials:

```yaml
env:
  NODE_ENV: production
  NEXT_PUBLIC_CI: true  # ← Bypass validation
  
  # Real values
  NEXT_PUBLIC_SITE_URL: https://www.parlae.ca
  NEXT_PUBLIC_PRODUCT_NAME: Parlae
  # ... all other NEXT_PUBLIC_* vars
  
  # Dummy auth values
  COGNITO_CLIENT_ID: dummy-client-id-for-build
  COGNITO_CLIENT_SECRET: dummy-client-secret-for-build
  COGNITO_ISSUER: https://cognito-idp.us-east-2.amazonaws.com/dummy-pool
  NEXTAUTH_SECRET: dummy-nextauth-secret-for-build-only
  NEXTAUTH_URL: https://app.parlae.ca
  
  # Dummy S3 values
  AWS_REGION: us-east-2
  S3_BUCKET_NAME: parlae-ci-dummy-bucket
  S3_PUBLIC_BASE_URL: https://dummy-s3-url-for-ci-build.com
  
  # CMS (optional - empty means no CMS)
  CMS_CLIENT: ""
```

### Production Deployment (deploy-frontend.yml)

Uses **real values** from GitHub Secrets:

```yaml
docker buildx build \
  --build-arg NEXT_PUBLIC_PRODUCT_NAME="Parlae" \
  --build-arg NEXT_PUBLIC_SITE_URL="https://www.parlae.ca" \
  --build-arg COGNITO_CLIENT_ID="${{ secrets.COGNITO_CLIENT_ID }}" \
  --build-arg COGNITO_CLIENT_SECRET="${{ secrets.COGNITO_CLIENT_SECRET }}" \
  --build-arg COGNITO_ISSUER="${{ secrets.COGNITO_ISSUER }}" \
  --build-arg NEXTAUTH_SECRET="${{ secrets.NEXTAUTH_SECRET }}" \
  --build-arg NEXTAUTH_URL="https://app.parlae.ca" \
  ...
```

### Docker Build (frontend.Dockerfile)

Has **defaults** that can be overridden:

```dockerfile
# Defaults
ARG NEXT_PUBLIC_PRODUCT_NAME="Parlae"
ARG NEXT_PUBLIC_SITE_URL="https://www.parlae.ca"
ARG AWS_REGION="us-east-2"
ARG S3_BUCKET_NAME="parlae-uploads"
ARG COGNITO_CLIENT_ID="dummy-client-id-for-docker-build"
# etc...

# Set as ENV
ENV NEXT_PUBLIC_PRODUCT_NAME=$NEXT_PUBLIC_PRODUCT_NAME
ENV AWS_REGION=$AWS_REGION
# etc...
```

---

## Complete Variable List

### App Config (8 variables)
- ✅ `NEXT_PUBLIC_PRODUCT_NAME`
- ✅ `NEXT_PUBLIC_SITE_TITLE`
- ✅ `NEXT_PUBLIC_SITE_DESCRIPTION`
- ✅ `NEXT_PUBLIC_SITE_URL`
- ✅ `NEXT_PUBLIC_DEFAULT_LOCALE`
- ✅ `NEXT_PUBLIC_DEFAULT_THEME_MODE`
- ✅ `NEXT_PUBLIC_THEME_COLOR`
- ✅ `NEXT_PUBLIC_THEME_COLOR_DARK`

### Feature Flags (5 variables)
- ✅ `NEXT_PUBLIC_ENABLE_THEME_TOGGLE`
- ✅ `NEXT_PUBLIC_ENABLE_PERSONAL_ACCOUNT_DELETION`
- ✅ `NEXT_PUBLIC_ENABLE_PERSONAL_ACCOUNT_BILLING`
- ✅ `NEXT_PUBLIC_LANGUAGE_PRIORITY`
- ✅ `NEXT_PUBLIC_ENABLE_VERSION_UPDATER`

### Authentication (5 variables)
- ✅ `COGNITO_CLIENT_ID`
- ✅ `COGNITO_CLIENT_SECRET`
- ✅ `COGNITO_ISSUER`
- ✅ `NEXTAUTH_SECRET`
- ✅ `NEXTAUTH_URL`

### CMS (1 variable - optional)
- ✅ `CMS_CLIENT`

### AWS/S3 (3 variables)
- ✅ `AWS_REGION`
- ✅ `S3_BUCKET_NAME`
- ✅ `S3_PUBLIC_BASE_URL` (optional)

### CMS (1 variable - optional)
- ✅ `CMS_CLIENT` (optional: "keystatic" | "wordpress" | "" for none)

### CI Control (2 variables)
- ✅ `NEXT_PUBLIC_CI`
- ✅ `NODE_ENV`

**Total:** 24 environment variables (23 required + 1 optional CMS)

---

## Changes Made to Fix Build Errors

### 1. Fixed S3 Module-Level Validation

**File:** `apps/frontend/apps/web/app/api/uploads/presign/route.ts`

**Problem:** Threw error at module load time if `S3_BUCKET_NAME` was missing

**Solution:**
```typescript
// Before
if (!S3_BUCKET_NAME) {
  throw new Error('S3_BUCKET_NAME is not configured.');
}

// After
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';
const isCI = process.env.NEXT_PUBLIC_CI === 'true';

if (!S3_BUCKET_NAME && !isBuildTime && !isCI) {
  throw new Error('S3_BUCKET_NAME is not configured.');
}

// Also added runtime check in POST handler
export const POST = async (request: Request) => {
  if (!S3_BUCKET_NAME) {
    return NextResponse.json(
      { error: 'S3 storage is not configured. Please contact support.' },
      { status: 503 },
    );
  }
  // ... rest of handler
}
```

### 2. Added All Missing Variables to CI Workflows

**Files:**
- `.github/workflows/test-frontend.yml`
- `.github/workflows/test-all.yml`

**Added:**
- All `NEXT_PUBLIC_*` app config variables
- All `NEXT_PUBLIC_*` feature flag variables
- `AWS_REGION`, `S3_BUCKET_NAME`, `S3_PUBLIC_BASE_URL`

### 3. Updated Dockerfile Defaults

**File:** `infra/docker/frontend.Dockerfile`

**Added:**
- Feature flag ARG/ENV declarations
- S3/AWS ARG/ENV declarations

---

## Verification Checklist

### Before Deployment:

- [x] All GitHub Secrets set (from AWS SSM us-east-2)
  - `COGNITO_CLIENT_ID`
  - `COGNITO_CLIENT_SECRET`
  - `COGNITO_ISSUER`
  - `NEXTAUTH_SECRET`
  - `STRIPE_PUBLISHABLE_KEY_PROD`
  
- [x] CI workflows have all required env vars
  - `test-frontend.yml` ✅
  - `test-all.yml` ✅
  - `deploy-frontend.yml` ✅
  
- [x] Dockerfile has all defaults
  - `frontend.Dockerfile` ✅
  
- [x] Module-level validations bypassed in CI
  - `nextauth.ts` ✅ (detects dummy values)
  - `app/api/uploads/presign/route.ts` ✅ (checks `NEXT_PUBLIC_CI`)

### After Deployment:

- [ ] Production build succeeds
- [ ] Auth works (Cognito integration)
- [ ] File uploads work (S3 integration)
- [ ] Feature flags applied correctly
- [ ] Theme configuration working

---

## Troubleshooting

### Build fails with "X is not set"

1. Check if variable is in CI workflow `env` section
2. Check if variable is passed as `--build-arg` in deploy workflow
3. Check if variable has `ARG` and `ENV` in Dockerfile

### Build fails with "HTTPS URL required"

1. Ensure `NEXT_PUBLIC_CI=true` is set in CI workflows
2. Ensure `NEXT_PUBLIC_SITE_URL` starts with `https://`

### Runtime error "S3 not configured"

1. This is expected in CI (S3 upload API will return 503)
2. In production, set real `S3_BUCKET_NAME` via ECS task definition

### Auth fails in production

1. Check GitHub Secrets are set correctly
2. Verify Cognito values from AWS SSM: `/parlae/frontend/*`
3. Ensure region is `us-east-2` not `us-east-1`

---

## Related Documentation

- [CI/CD Pipeline](./CI_CD_IMPROVEMENTS.md)
- [GitHub Secrets Setup](./GITHUB_SECRETS_SETUP.md)
- [Docker Build Env Vars](./DOCKER_BUILD_ENV_VARS.md)
- [HTTPS URL Fix](./NEXT_PUBLIC_SITE_URL_FIX.md)
- [Deployment Ready](./DEPLOYMENT_READY.md)

---

**Last Updated:** 2026-02-11  
**Status:** ✅ Complete - All 23 variables configured  
**Total Variables:** 23 required, 1 optional (S3_PUBLIC_BASE_URL)
