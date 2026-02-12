# Quick Fix: Google OAuth and Translations Not Working

## TL;DR - Do This Now:

```bash
# 1. Set the correct COGNITO_DOMAIN (without https://)
gh secret set COGNITO_DOMAIN --body "parlae-auth-2026.auth.us-east-2.amazoncognito.com"

# 2. Trigger a manual deployment
gh workflow run deploy-frontend.yml

# 3. Wait 5-10 minutes for deployment to complete

# 4. Force browser cache clear:
# - Chrome/Edge: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
# - Visit: https://app.parlae.ca/auth/sign-in
```

## Problem Analysis

### Issue 1: Google OAuth URL Still Wrong

The URL `https://parlae-auth/oauth2/authorize` indicates:
- `COGNITO_DOMAIN` is either not set correctly OR
- ECS is using an old Docker image

**What to check:**
```bash
# View the actual secret (won't show value, just metadata)
gh secret list | grep COGNITO_DOMAIN
```

**The value MUST be:**
```
parlae-auth-2026.auth.us-east-2.amazoncognito.com
```

**NOT:**
- `https://parlae-auth-2026.auth.us-east-2.amazoncognito.com` ❌ (remove https://)
- `parlae-auth` ❌ (missing full domain)
- The COGNITO_ISSUER value ❌ (that's a different variable)

### Issue 2: Translations Not Working

Two possibilities:
1. **Browser cache** - Old JavaScript/HTML cached
2. **Image not rebuilt** - Translation files not in the Docker image

## Step-by-Step Fix

### Step 1: Verify COGNITO_DOMAIN Value

If you're not sure what value you set, update it again:

```bash
gh secret set COGNITO_DOMAIN --body "parlae-auth-2026.auth.us-east-2.amazoncognito.com"
```

⚠️ **IMPORTANT**: Do NOT include `https://` in the value!

### Step 2: Verify Recent Commits Were Pushed

Check if your translation file changes are in the repo:

```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae
git status
git log --oneline -5
```

If you see uncommitted changes, commit and push:

```bash
git add .
git commit -m "Fix: Update translations and Cognito domain configuration"
git push
```

### Step 3: Trigger Manual Deployment

```bash
gh workflow run deploy-frontend.yml
```

Or via GitHub UI:
1. Go to: https://github.com/YOUR_USERNAME/parlae/actions/workflows/deploy-frontend.yml
2. Click "Run workflow"
3. Select branch: main
4. Click "Run workflow"

### Step 4: Monitor Deployment

```bash
# Watch deployment progress
gh run watch

# Or check status
gh run list --workflow=deploy-frontend.yml --limit 1
```

Wait for "✓ completed" status (takes 3-5 minutes).

### Step 5: Clear Browser Cache & Test

After deployment completes:

1. **Hard refresh** the auth page:
   - Windows/Linux: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

2. Or clear cache completely:
   - Chrome: Settings → Privacy → Clear browsing data → Cached images and files
   - Firefox: Settings → Privacy → Clear Data → Cached Web Content

3. Visit: https://app.parlae.ca/auth/sign-in

4. **Test Google OAuth:**
   - Click "Continue with Google"
   - URL should be: `https://parlae-auth-2026.auth.us-east-2.amazoncognito.com/oauth2/authorize...`
   - NOT: `https://parlae-auth/oauth2/authorize...`

5. **Test Translations:**
   - Switch language to French (if you have a language selector)
   - Should see "Bienvenue sur Parlae" in the left sidebar
   - Should see "Bon retour" or "Bienvenue" as the heading

## If Still Not Working

### Check Docker Image Was Rebuilt

The latest deployment should have built a new image. Verify:

```bash
# Check latest workflow run details
gh run view --log | grep "Build and push image"
```

Look for:
- `--build-arg COGNITO_DOMAIN=...` in the build command
- Build completed successfully

### Check ECS Task Definition

The ECS service should be using the latest task. Check:

```bash
# List ECS clusters (if AWS CLI configured)
aws ecs list-clusters --region us-east-2

# Describe the service
aws ecs describe-services \
  --cluster YOUR_CLUSTER_NAME \
  --services parlae-frontend \
  --region us-east-2
```

### View Container Logs

If OAuth is still failing:

```bash
# View logs (if AWS CLI configured)
aws logs tail /ecs/parlae-frontend --follow --region us-east-2 | grep -i cognito
```

Look for startup logs showing COGNITO_DOMAIN value.

## Quick Reference: Required Secrets

| Secret Name | Correct Value Format | Example |
|-------------|---------------------|---------|
| `COGNITO_ISSUER` | `https://cognito-idp.{region}.amazonaws.com/{pool-id}` | `https://cognito-idp.us-east-2.amazonaws.com/us-east-2_abc123` |
| `COGNITO_DOMAIN` | `{prefix}.auth.{region}.amazoncognito.com` | `parlae-auth-2026.auth.us-east-2.amazoncognito.com` |
| `COGNITO_CLIENT_ID` | Cognito app client ID | `389m79tk1dhn1v5122ivajamdm` |
| `COGNITO_CLIENT_SECRET` | Cognito app client secret | `[secret value]` |

## Files That Should Be Deployed

Make sure these files are committed and pushed:

- ✅ `apps/frontend/apps/web/public/locales/en/auth.json` (updated)
- ✅ `apps/frontend/apps/web/public/locales/fr/auth.json` (updated)
- ✅ `apps/frontend/apps/web/app/auth/layout.tsx` (with Trans components)
- ✅ `.github/workflows/deploy-frontend.yml` (with COGNITO_DOMAIN build arg)
- ✅ `infra/docker/frontend.Dockerfile` (with COGNITO_DOMAIN ARG/ENV)

## Common Mistakes

1. ❌ Adding `https://` to COGNITO_DOMAIN
   - Wrong: `https://parlae-auth-2026.auth.us-east-2.amazoncognito.com`
   - Right: `parlae-auth-2026.auth.us-east-2.amazoncognito.com`

2. ❌ Using COGNITO_ISSUER value for COGNITO_DOMAIN
   - COGNITO_ISSUER: For token verification (contains `/pool-id`)
   - COGNITO_DOMAIN: For OAuth flows (no path, just domain)

3. ❌ Not waiting for deployment to complete
   - GitHub Actions takes 3-5 minutes
   - ECS task rollout takes another 2-3 minutes
   - Total: ~8 minutes

4. ❌ Browser cache serving old code
   - Always hard refresh after deployment
   - Or use incognito/private mode for testing

## Success Criteria

✅ Google OAuth URL is: `https://parlae-auth-2026.auth.us-east-2.amazoncognito.com/oauth2/authorize...`

✅ French translations appear when language is switched

✅ No "site can't be reached" errors

✅ OAuth flow completes and user is logged in
