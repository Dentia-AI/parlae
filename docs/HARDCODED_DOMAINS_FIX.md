# Hardcoded Domain Names Fix (dentiaapp.com → parlae.ca)

## Issue

Signup and other auth flows were redirecting to `https://app.dentiaapp.com` instead of `https://app.parlae.ca`.

## Root Cause

The codebase had **hardcoded "dentiaapp.com" domain references** in several key files that control URL generation and routing:

1. **`lib/urls/app-host.ts`** - Primary app URL generation
2. **`proxy.ts`** - Host routing for app vs marketing
3. **`lib/auth/validate-redirect-url.ts`** - Auth redirect validation

These hardcoded values were being used as **fallbacks** when environment variables weren't set.

## Files with Hardcoded References

### Critical Files (Fixed)

1. **`apps/frontend/apps/web/lib/urls/app-host.ts`**
   ```typescript
   // ❌ Before
   const FALLBACK_APP_HOST = 'app.dentiaapp.com';
   const primaryAppHost = parsedHosts[0] ?? 'app.dentiaapp.com';
   export const primaryAppHost = 'app.dentiaapp.com';
   export const appBaseUrl = 'https://app.dentiaapp.com';
   
   // ✅ After
   const FALLBACK_APP_HOST = 'app.parlae.ca';
   const primaryAppHost = parsedHosts[0] ?? 'app.parlae.ca';
   export const primaryAppHost = 'app.parlae.ca';
   export const appBaseUrl = 'https://app.parlae.ca';
   ```

2. **`apps/frontend/apps/web/proxy.ts`**
   ```typescript
   // ❌ Before
   const DEFAULT_APP_HOST = 'app.dentiaapp.com';
   const DEFAULT_MARKETING_HOST = 'www.dentiaapp.com';
   
   // ✅ After
   const DEFAULT_APP_HOST = 'app.parlae.ca';
   const DEFAULT_MARKETING_HOST = 'www.parlae.ca';
   ```

3. **`apps/frontend/apps/web/lib/auth/validate-redirect-url.ts`**
   ```typescript
   // ❌ Before
   'dentiaapp.com',
   
   // ✅ After
   'parlae.ca',
   ```

### Other References (Legacy/Comments)

These files still contain "dentiaapp.com" or "dentia" references but are either:
- Comments/documentation
- Test files
- Legacy code that doesn't affect routing
- Domain-specific logic (e.g., GoHighLevel tagging)

**Files with remaining references:**
- `packages/shared/src/auth/nextauth.ts` - CORS allowed origin (comment about hub.dentiaapp.com)
- `packages/shared/src/gohighlevel/gohighlevel.service.ts` - Domain-specific tagging logic
- `.env.development`, `.env.test` - Local S3 bucket names (dentia-local-bucket, dentia-test-bucket)
- `app/api/auth/session/route.ts` - CORS for hub (legacy, can be updated if needed)
- `app/sso/discourse/route.ts` - SSO redirect (legacy Discourse integration)
- Test files - Test expectations

## Environment Variables Added

To ensure domains are properly configured, added explicit host configuration to the Dockerfile:

```dockerfile
# infra/docker/frontend.Dockerfile

# Build arguments
ARG APP_HOSTS="app.parlae.ca"
ARG MARKETING_HOSTS="www.parlae.ca,parlae.ca"

# Environment variables
ENV APP_HOSTS=$APP_HOSTS
ENV MARKETING_HOSTS=$MARKETING_HOSTS
```

## How URL Generation Works

### Priority Order

1. **Environment Variables** (highest priority)
   - `APP_HOSTS` or `APP_HOST`
   - Used if set, supports comma-separated list

2. **Fallback Constants**
   - `FALLBACK_APP_HOST = 'app.parlae.ca'`
   - Used if no environment variable set

3. **Client-Side Detection**
   - For localhost, uses `window.location` to preserve port
   - For production, uses server-side logic

### Example Flow

```typescript
// User clicks sign-up button
getAppUrl('/auth/sign-up')

// Server-side:
// 1. Reads APP_HOSTS from env → "app.parlae.ca"
// 2. Splits and takes first host → "app.parlae.ca"
// 3. Constructs URL → "https://app.parlae.ca/auth/sign-up"

// Client-side (if on localhost:3000):
// 1. Detects localhost
// 2. Uses current URL → "http://localhost:3000/auth/sign-up"
```

## Verification Steps

### 1. Local Development

```bash
# In .env.local (optional, will use fallback if not set)
APP_HOSTS=app.parlae.ca
MARKETING_HOSTS=www.parlae.ca,parlae.ca
```

**Test:**
- Click sign-up → Should go to `http://localhost:3000/auth/sign-up` (localhost preserved)
- Deploy locally → Should use `app.parlae.ca`

### 2. Production Deployment

The Dockerfile now includes:
```dockerfile
ENV APP_HOSTS=app.parlae.ca
ENV MARKETING_HOSTS=www.parlae.ca,parlae.ca
```

**Test after deployment:**
```bash
# From www.parlae.ca, click sign-up
# Should redirect to: https://app.parlae.ca/auth/sign-up

# Check generated URLs in source
curl https://www.parlae.ca | grep -o 'https://[^"]*parlae.ca[^"]*'
```

### 3. Verify No dentiaapp.com References

```bash
# Check build output
grep -r "dentiaapp.com" apps/frontend/apps/web/.next/ | grep -v "node_modules"

# Should only show:
# - Comments
# - Test files
# - Legacy/inactive code
```

## Domain Strategy

### Current Setup

**Production Domains:**
- **Marketing Site**: `www.parlae.ca` (also accessible via `parlae.ca`)
- **Application**: `app.parlae.ca`
- **Auth Callbacks**: `app.parlae.ca/api/auth/*`

**Routing Logic:**
- Requests to `www.parlae.ca` or `parlae.ca` → Marketing pages
- Requests to `app.parlae.ca` → Application pages (requires auth)
- The proxy middleware handles routing based on `APP_HOSTS` and `MARKETING_HOSTS`

### Why Separate Domains?

1. **SEO**: Marketing content on `www` for better indexing
2. **Security**: App on subdomain with stricter CSP
3. **Caching**: Different caching strategies for marketing vs app
4. **Organization**: Clear separation of concerns

## Related Configuration

### Files Modified in This Fix

```
M  apps/frontend/apps/web/lib/urls/app-host.ts
   • Changed FALLBACK_APP_HOST to 'app.parlae.ca'
   • Updated all hardcoded references
   • Updated exported constants

M  apps/frontend/apps/web/proxy.ts
   • Changed DEFAULT_APP_HOST to 'app.parlae.ca'
   • Changed DEFAULT_MARKETING_HOST to 'www.parlae.ca'

M  apps/frontend/apps/web/lib/auth/validate-redirect-url.ts
   • Changed allowed domain to 'parlae.ca'

M  infra/docker/frontend.Dockerfile
   • Added APP_HOSTS build arg and env var
   • Added MARKETING_HOSTS build arg and env var
```

### Environment Variables Summary

**Required for Production:**
```bash
# App domain
APP_HOSTS=app.parlae.ca

# Marketing domains (comma-separated)
MARKETING_HOSTS=www.parlae.ca,parlae.ca

# Site URL (already configured)
NEXT_PUBLIC_SITE_URL=https://www.parlae.ca

# Auth URL (already configured)
NEXTAUTH_URL=https://app.parlae.ca
```

## Troubleshooting

### Still seeing dentiaapp.com?

1. **Check environment variables:**
   ```bash
   echo $APP_HOSTS
   echo $MARKETING_HOSTS
   ```

2. **Clear build cache:**
   ```bash
   rm -rf .next
   pnpm build
   ```

3. **Check browser cache:**
   - Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)
   - Clear site data in DevTools

4. **Verify Dockerfile build args:**
   ```bash
   docker build --build-arg APP_HOSTS=app.parlae.ca ...
   ```

### Auth redirects not working?

1. **Check Cognito allowed callbacks:**
   - Must include `https://app.parlae.ca/api/auth/callback/cognito`
   - AWS Console → Cognito → App Clients → Allowed callback URLs

2. **Check NEXTAUTH_URL:**
   ```bash
   # Should be set to
   NEXTAUTH_URL=https://app.parlae.ca
   ```

## Next Steps

### Optional Cleanup (Future)

1. **Remove legacy hub.dentiaapp.com references:**
   - `app/api/auth/session/route.ts` - Update CORS origin
   - `app/sso/discourse/route.ts` - Update SSO callback (if using Discourse)

2. **Update test expectations:**
   - `app/api/auth/session/__tests__/route.test.ts`

3. **Consider renaming S3 buckets:**
   - `dentia-local-bucket` → `parlae-local-bucket`
   - `dentia-test-bucket` → `parlae-test-bucket`
   - (Low priority - these are local/test only)

---

**Last Updated:** 2026-02-11  
**Status:** ✅ Fixed  
**Issue:** Signup redirecting to dentiaapp.com instead of parlae.ca  
**Solution:** Updated all hardcoded domain fallbacks to parlae.ca
