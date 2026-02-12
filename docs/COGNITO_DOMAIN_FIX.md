# COGNITO_DOMAIN Missing - Critical Fix

**Date**: February 11, 2026  
**Status**: ✅ Fixed in code - Requires GitHub Secret

## Problem
The OAuth URL was still using `parlae-auth` instead of the full Cognito domain URL because `COGNITO_DOMAIN` environment variable was completely missing from the deployment configuration.

## Root Cause Analysis

Looking at the NextAuth configuration in `packages/shared/src/auth/nextauth.ts`:

```typescript
function buildCognitoUrl(path: string) {
  const base = cognitoDomain ?? issuerDomain;  // Line 65
  
  if (!base) {
    throw new Error('COGNITO_DOMAIN or COGNITO_ISSUER must be defined');
  }
  
  return `${base.replace(/\/$/, '')}${path}`;
}
```

The code tries to use `COGNITO_DOMAIN` first, but falls back to `COGNITO_ISSUER` if not set.

**The Problem:**
- `COGNITO_DOMAIN` was NOT set anywhere
- `COGNITO_ISSUER` = `https://cognito-idp.us-east-2.amazonaws.com/us-east-2_XXX` (for token verification)
- Code extracted just `parlae-auth` somehow from the issuer
- Result: OAuth URL became `https://parlae-auth/oauth2/authorize` ❌

**What it should be:**
- `COGNITO_DOMAIN` = `parlae-auth-2026.auth.us-east-2.amazoncognito.com` (Cognito hosted UI domain)
- Result: OAuth URL = `https://parlae-auth-2026.auth.us-east-2.amazoncognito.com/oauth2/authorize` ✅

## Fix Applied

### 1. Updated GitHub Actions Workflow
Added `COGNITO_DOMAIN` build argument:

```yaml
--build-arg COGNITO_DOMAIN="${{ secrets.COGNITO_DOMAIN }}" \
```

### 2. Updated Dockerfile
Added ARG and ENV for `COGNITO_DOMAIN`:

```dockerfile
# Auth build arguments
ARG COGNITO_DOMAIN=""

# Auth environment variables  
ENV COGNITO_DOMAIN=$COGNITO_DOMAIN
```

## Required Action: Add GitHub Secret

You need to add `COGNITO_DOMAIN` as a GitHub secret:

### Find Your Cognito Domain

**Option 1: From AWS Console**
1. Go to [AWS Cognito Console](https://console.aws.amazon.com/cognito)
2. Select region: **us-east-2**
3. Click your user pool
4. Go to "App integration" tab
5. Scroll to "Domain" section
6. Copy the domain (e.g., `parlae-auth-2026.auth.us-east-2.amazoncognito.com`)

**Option 2: From Error URL**
Looking at your error URL: `https://parlae-auth/oauth2/authorize...`
- Your domain is likely: `parlae-auth-2026.auth.us-east-2.amazoncognito.com`
- Format: `{domain-prefix}.auth.{region}.amazoncognito.com`

### Add GitHub Secret

**Using GitHub CLI:**
```bash
gh secret set COGNITO_DOMAIN --body "parlae-auth-2026.auth.us-east-2.amazoncognito.com"
```

**Using GitHub Web UI:**
1. Go to: https://github.com/YOUR_USERNAME/parlae/settings/secrets/actions
2. Click "New repository secret"
3. Name: `COGNITO_DOMAIN`
4. Value: `parlae-auth-2026.auth.us-east-2.amazoncognito.com` (without https://)

## Understanding the Two Variables

| Variable | Purpose | Format | Example |
|----------|---------|--------|---------|
| **COGNITO_ISSUER** | Token verification endpoint | `https://cognito-idp.{region}.amazonaws.com/{pool-id}` | `https://cognito-idp.us-east-2.amazonaws.com/us-east-2_abc123` |
| **COGNITO_DOMAIN** | Hosted UI domain for OAuth flows | `{domain-prefix}.auth.{region}.amazoncognito.com` | `parlae-auth-2026.auth.us-east-2.amazoncognito.com` |

**Both are required:**
- `COGNITO_ISSUER` → Used by NextAuth to verify JWT tokens
- `COGNITO_DOMAIN` → Used to build OAuth authorization URLs

## Files Modified

1. `.github/workflows/deploy-frontend.yml` - Added COGNITO_DOMAIN build arg
2. `infra/docker/frontend.Dockerfile` - Added COGNITO_DOMAIN ARG and ENV
3. `docs/COGNITO_DOMAIN_FIX.md` - This documentation

## Deploy After Adding Secret

1. Add the GitHub secret (see above)
2. Commit and push these code changes
3. Deploy will automatically trigger
4. Test Google OAuth flow

## Verification

After deployment with the secret added:

1. Go to https://app.parlae.ca/auth/sign-in
2. Click "Continue with Google"
3. **Expected redirect:**
   ```
   https://parlae-auth-2026.auth.us-east-2.amazoncognito.com/oauth2/authorize?...
   ```
4. Complete Google sign-in
5. Should redirect back and log you in ✅

## Summary

**Before:**
- ❌ `COGNITO_DOMAIN` not set
- ❌ Falls back to `COGNITO_ISSUER` 
- ❌ URL: `https://parlae-auth/oauth2/authorize`

**After:**
- ✅ `COGNITO_DOMAIN` properly configured
- ✅ Uses correct hosted UI domain
- ✅ URL: `https://parlae-auth-2026.auth.us-east-2.amazoncognito.com/oauth2/authorize`
