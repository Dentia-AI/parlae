# Auth Pages & Google Sign-In Fix

**Date**: February 11, 2026  
**Status**: ✅ Complete

## Issue Summary

The sign-in and sign-up pages had several issues:
1. Google sign-in button was not appearing in production (parlae.ca)
2. Pages still showed "starter kit" placeholder text (AWS, Stripe, Uptime references)
3. Sign-up page showed "Join Dentia" instead of "Join Parlae"
4. Back button was present linking to marketing site
5. Generic/template descriptions instead of Parlae-specific messaging

## Root Cause

The `NEXT_PUBLIC_COGNITO_SOCIAL_PROVIDERS` environment variable was:
- ✅ Correctly set in `.env.local` for development
- ✅ Correctly set in `.env.production` file
- ❌ **NOT being passed as a build argument** in Docker builds
- ❌ **NOT defined as an ARG/ENV** in the Dockerfile

This caused the Google button to work locally but not in production builds.

## Changes Made

### 1. Auth Layout (`apps/frontend/apps/web/app/auth/layout.tsx`)

**Removed:**
- "Back to marketing site" link with arrow icon
- "Only ads you need" heading
- AWS-specific text: "powered entirely by AWS"
- "99.9% uptime" / "AWS Aurora + Cognito" stats
- "Usage based billing" / "Stripe metered plans" stats
- Unused imports (Link, ArrowLeft)

**Added:**
- Larger Parlae logo (h-10 in top section, h-16 in center)
- "Welcome to Parlae" heading
- Healthcare AI agent messaging: "Get started with your AI agent for your healthcare team. Transform patient engagement and step into an exciting future of intelligent practice management."
- Footer tagline: "Empower your practice with AI-driven conversations that enhance patient care and streamline team collaboration."

### 2. Sign-Up Page (`apps/frontend/apps/web/app/auth/sign-up/page.tsx`)

**Changed:**
- Heading: "Join Dentia" → **"Join Parlae"**
- Description: **"Create your account and start building AI agents for your healthcare practice."**

### 3. Sign-In Page (`apps/frontend/apps/web/app/auth/sign-in/page.tsx`)

**Changed:**
- Description: **"Sign in to check what's new and manage your AI agents."**

### 4. Docker Configuration (`infra/docker/frontend.Dockerfile`)

**Added:**
```dockerfile
# Build arguments with defaults for production
ARG NEXT_PUBLIC_COGNITO_SOCIAL_PROVIDERS="Google"

# Set environment variables from build args
ENV NEXT_PUBLIC_COGNITO_SOCIAL_PROVIDERS=$NEXT_PUBLIC_COGNITO_SOCIAL_PROVIDERS
```

### 5. Production Deployment Workflow (`.github/workflows/deploy-frontend.yml`)

**Added build argument:**
```yaml
--build-arg NEXT_PUBLIC_COGNITO_SOCIAL_PROVIDERS="Google" \
```

### 6. Dev Deployment Workflow (`.github/workflows/deploy-dev-environment.yml`)

**Added build argument:**
```yaml
--build-arg NEXT_PUBLIC_COGNITO_SOCIAL_PROVIDERS="Google" \
```

## Verification

### Local Development
✅ Google sign-in button appears (already working)

### Production Deployment
After next deployment:
1. Build process will include `NEXT_PUBLIC_COGNITO_SOCIAL_PROVIDERS=Google`
2. Google sign-in button will appear on both sign-in and sign-up pages at app.parlae.ca
3. Auth pages will show Parlae branding (no AWS/Stripe/Uptime references)

## Files Modified

1. `apps/frontend/apps/web/app/auth/layout.tsx` - Auth layout branding
2. `apps/frontend/apps/web/app/auth/sign-in/page.tsx` - Sign-in page text
3. `apps/frontend/apps/web/app/auth/sign-up/page.tsx` - Sign-up page text
4. `infra/docker/frontend.Dockerfile` - Docker build configuration
5. `.github/workflows/deploy-frontend.yml` - Production deployment
6. `.github/workflows/deploy-dev-environment.yml` - Dev deployment

## Next Steps

1. **Deploy to production**: Merge these changes and trigger a deployment
2. **Verify**: After deployment, visit `https://app.parlae.ca/auth/sign-in` and confirm Google button appears
3. **Test**: Click "Continue with Google" to ensure OAuth flow works correctly

## Technical Notes

### Why `NEXT_PUBLIC_` Variables Need Build Args

Next.js replaces `NEXT_PUBLIC_*` environment variables at **build time**, not runtime. This means:

- ✅ Variables must be present during `pnpm build`
- ❌ Setting them only in ECS task definition is too late
- ✅ Docker build args pass them to the build stage
- ✅ `.env.production` file provides defaults for local builds

### Current Configuration

The environment variable is now set in three places:

1. **`.env.production`** - Default for local production builds
2. **Dockerfile ARG** - Default value if not overridden
3. **GitHub Actions** - Explicit value passed during CI/CD builds

This ensures the Google provider is available in all build contexts.

## Related Configuration

### Cognito OAuth Setup
Google OAuth is configured in AWS Cognito with:
- Provider: Google
- OAuth scopes: openid, profile, email
- Callback URL: https://app.parlae.ca/api/auth/callback/cognito

See `docs/PARLAE_GOOGLE_OAUTH_SETUP.md` for full OAuth configuration details.
