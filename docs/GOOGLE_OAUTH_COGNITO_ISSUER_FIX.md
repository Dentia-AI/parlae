# Google OAuth Not Working - COGNITO_ISSUER Fix

**Date**: February 11, 2026  
**Status**: ⚠️ CRITICAL - Requires GitHub Secret Update

## 🚨 Problem

When clicking "Sign in with Google", users get redirected to an invalid URL:
```
https://parlae-auth/oauth2/authorize?...
```

This should be:
```
https://parlae-auth-2026.auth.us-east-2.amazoncognito.com/oauth2/authorize?...
```

## Root Cause

The `COGNITO_ISSUER` environment variable is incorrectly configured. The OAuth flow needs:
1. **COGNITO_ISSUER**: The Cognito User Pool issuer URL
2. **COGNITO_DOMAIN**: The Cognito hosted UI domain (optional custom domain)

These are two DIFFERENT values that serve different purposes.

## Current State

### Local (.env.local) ❌
```env
COGNITO_ISSUER=http://localhost:3000  # WRONG!
```

### Production (GitHub Secret) ❌
Likely set to something like `parlae-auth` instead of the full issuer URL.

## Required GitHub Secrets

You need to update/add these GitHub Secrets:

| Secret Name | Correct Value | Purpose |
|-------------|---------------|---------|
| `COGNITO_ISSUER` | `https://cognito-idp.us-east-2.amazonaws.com/us-east-2_XXXXXXXXX` | User Pool issuer (for NextAuth) |
| `COGNITO_DOMAIN` | `parlae-auth-2026.auth.us-east-2.amazoncognito.com` | Hosted UI domain (optional) |
| `COGNITO_CLIENT_ID` | Your Cognito app client ID | App client ID |
| `COGNITO_CLIENT_SECRET` | Your Cognito app client secret | App client secret |

## How to Find the Correct Values

### Option 1: From AWS Console

1. Go to [AWS Cognito Console](https://console.aws.amazon.com/cognito)
2. Select region: **us-east-2** (Ohio)
3. Click on your user pool: **parlae-user-pool**

**For COGNITO_ISSUER:**
4. In the user pool overview, look for "User pool ID"
5. Format: `https://cognito-idp.{region}.amazonaws.com/{user-pool-id}`
6. Example: `https://cognito-idp.us-east-2.amazonaws.com/us-east-2_abc123XYZ`

**For COGNITO_DOMAIN:**
7. Go to "App integration" tab
8. Scroll down to "Domain"
9. You'll see either:
   - AWS-provided: `parlae-auth-2026.auth.us-east-2.amazoncognito.com`
   - Custom domain: `login.parlae.ca` (if configured)

**For COGNITO_CLIENT_ID and COGNITO_CLIENT_SECRET:**
10. Go to "App integration" → "App clients"
11. Click on your app client (e.g., `parlae-frontend-client`)
12. Copy the "Client ID"
13. Click "Show client secret" to copy the secret

### Option 2: From Terraform Output

If you have terraform configured:

```bash
cd /path/to/parlae-infra/infra/environments/prod

# Get User Pool ID
terraform output cognito_user_pool_id
# Output: us-east-2_abc123XYZ

# Get Cognito Domain
terraform output cognito_domain
# Output: parlae-auth-2026.auth.us-east-2.amazoncognito.com

# Get Client ID
terraform output cognito_client_id
# Output: 389m79tk1dhn1v5122ivajamdm

# Get Client Secret
terraform output -raw cognito_client_secret
# Output: [secret value]
```

Then construct the issuer:
```
COGNITO_ISSUER=https://cognito-idp.us-east-2.amazonaws.com/[user-pool-id]
```

## Fix Steps

### 1. Update GitHub Secrets

**Using GitHub CLI:**
```bash
# Replace with your actual values
gh secret set COGNITO_ISSUER --body "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_XXXXXXXXX"
gh secret set COGNITO_DOMAIN --body "parlae-auth-2026.auth.us-east-2.amazoncognito.com"
gh secret set COGNITO_CLIENT_ID --body "YOUR_CLIENT_ID"
gh secret set COGNITO_CLIENT_SECRET --body "YOUR_CLIENT_SECRET"
```

**Using GitHub Web UI:**
1. Go to: https://github.com/YOUR_USERNAME/parlae/settings/secrets/actions
2. Find `COGNITO_ISSUER` and click "Update" (or "New repository secret")
3. Set value to: `https://cognito-idp.us-east-2.amazonaws.com/us-east-2_XXXXXXXXX`
4. Repeat for other secrets

### 2. Update Dockerfile (If Needed)

The Dockerfile should already have the correct ARG, but verify:

```dockerfile
# Auth build arguments
ARG COGNITO_CLIENT_ID
ARG COGNITO_CLIENT_SECRET
ARG COGNITO_ISSUER
ARG COGNITO_DOMAIN  # Optional
ARG NEXTAUTH_SECRET
ARG NEXTAUTH_URL

# Set as environment variables
ENV COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
ENV COGNITO_CLIENT_SECRET=$COGNITO_CLIENT_SECRET
ENV COGNITO_ISSUER=$COGNITO_ISSUER
ENV COGNITO_DOMAIN=$COGNITO_DOMAIN
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV NEXTAUTH_URL=$NEXTAUTH_URL
```

### 3. Update GitHub Actions Workflow

Verify `.github/workflows/deploy-frontend.yml` has:

```yaml
--build-arg COGNITO_CLIENT_ID="${{ secrets.COGNITO_CLIENT_ID }}" \
--build-arg COGNITO_CLIENT_SECRET="${{ secrets.COGNITO_CLIENT_SECRET }}" \
--build-arg COGNITO_ISSUER="${{ secrets.COGNITO_ISSUER }}" \
--build-arg NEXTAUTH_SECRET="${{ secrets.NEXTAUTH_SECRET }}" \
--build-arg NEXTAUTH_URL="https://app.parlae.ca" \
```

✅ Already correct in the workflow!

### 4. Update Local Environment

Update your `.env.local` for local testing:

```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae/apps/frontend/apps/web

# Edit .env.local
# Replace these with your actual values:
COGNITO_CLIENT_ID=389m79tk1dhn1v5122ivajamdm
COGNITO_CLIENT_SECRET=your_secret_here
COGNITO_ISSUER=https://cognito-idp.us-east-2.amazonaws.com/us-east-2_XXXXXXXXX
COGNITO_DOMAIN=parlae-auth-2026.auth.us-east-2.amazoncognito.com
NEXTAUTH_SECRET=your_nextauth_secret_min_32_chars
NEXTAUTH_URL=http://localhost:3000
```

### 5. Deploy

After updating secrets:
```bash
# Commit any code changes
git add .
git commit -m "Fix: Update Cognito configuration for Google OAuth"
git push

# Trigger deployment (or wait for auto-deploy)
```

## Verification

After deployment, test the OAuth flow:

1. Go to https://app.parlae.ca/auth/sign-in
2. Click "Continue with Google"
3. You should be redirected to the correct Cognito URL:
   ```
   https://parlae-auth-2026.auth.us-east-2.amazoncognito.com/oauth2/authorize?...
   ```
4. Complete Google sign-in
5. You should be redirected back to app.parlae.ca and logged in

## Understanding the Architecture

```
User clicks "Sign in with Google"
    ↓
NextAuth initiates OAuth flow
    ↓
Redirects to: COGNITO_DOMAIN/oauth2/authorize
    ↓
User signs in with Google
    ↓
Google redirects to: COGNITO_DOMAIN/oauth2/idpresponse
    ↓
Cognito processes response
    ↓
Cognito redirects to: app.parlae.ca/api/auth/callback/cognito
    ↓
NextAuth verifies with COGNITO_ISSUER
    ↓
User is authenticated!
```

### Key URLs:

| URL | Purpose | Example |
|-----|---------|---------|
| **COGNITO_ISSUER** | Token verification endpoint | `https://cognito-idp.us-east-2.amazonaws.com/us-east-2_XXX` |
| **COGNITO_DOMAIN** | Hosted UI domain | `parlae-auth-2026.auth.us-east-2.amazoncognito.com` |
| **OAuth Authorize** | Initiate OAuth flow | `https://[COGNITO_DOMAIN]/oauth2/authorize` |
| **OAuth Callback** | Where Google sends response | `https://[COGNITO_DOMAIN]/oauth2/idpresponse` |
| **NextAuth Callback** | Where Cognito sends final response | `https://app.parlae.ca/api/auth/callback/cognito` |

## Troubleshooting

### Still seeing "parlae-auth" instead of full domain?

The NextAuth configuration might be using `COGNITO_DOMAIN` instead of constructing the full URL. Check:

```typescript
// In your NextAuth config
CognitoProvider({
  clientId: process.env.COGNITO_CLIENT_ID!,
  clientSecret: process.env.COGNITO_CLIENT_SECRET!,
  issuer: process.env.COGNITO_ISSUER,  // This must be the full issuer URL
})
```

### Check ECS Task Definition

If secrets are correct but still not working, verify the ECS task is using the latest image:

```bash
aws ecs describe-services \
  --cluster parlae-cluster \
  --services parlae-frontend \
  --region us-east-2 \
  --query 'services[0].deployments'
```

Look for `desiredCount` and `runningCount` to match.

### View Container Logs

```bash
aws logs tail /ecs/parlae-frontend --follow --region us-east-2
```

Look for startup logs that show the Cognito configuration (values should be truncated for security).

## Files Modified

- `docs/GOOGLE_OAUTH_COGNITO_ISSUER_FIX.md` - This documentation

## Required Actions

1. ✅ Find correct COGNITO_ISSUER from AWS Console or Terraform
2. ⏳ Update GitHub Secret `COGNITO_ISSUER`
3. ⏳ Update GitHub Secret `COGNITO_DOMAIN` (if not set)
4. ⏳ Update local `.env.local` for testing
5. ⏳ Deploy to production
6. ⏳ Test Google OAuth flow

## Summary

The Google OAuth button works, but the redirect URL is malformed because `COGNITO_ISSUER` is not properly set. Update the GitHub secret with the full Cognito issuer URL and redeploy.

**Expected format:**
```
https://cognito-idp.{region}.amazonaws.com/{user-pool-id}
```

**NOT:**
```
parlae-auth
http://localhost:3000
```
