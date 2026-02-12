# How to Verify Latest Code Deployment

## Quick Commands

### 1. Check What's Deployed (via API endpoint)

```bash
# Check version info from production
curl https://app.parlae.ca/api/version

# Or open in browser:
# https://app.parlae.ca/api/version
```

This will show:
- Git commit SHA
- Build timestamp
- Environment variables

### 2. Check ECS Container Logs (AWS Console)

**Via AWS Console:**
1. Go to: https://console.aws.amazon.com/ecs
2. Select region: **us-east-2**
3. Click on cluster: `parlae-cluster` (or your cluster name)
4. Click on service: `parlae-frontend`
5. Go to "Logs" tab
6. Look for the startup message:

```
========================================
🚀 PARLAE FRONTEND STARTED
========================================
{
  "message": "Frontend Application Started",
  "gitCommit": "abc12345",           ← Check this matches latest commit
  "buildTimestamp": "2026-02-12...",  ← Check this is recent
  "cognitoDomain": "parlae-auth-2026.auth.us-east-2.amazoncognito.com",
  "cognitoSocialProviders": "Google",
  "languagePriority": "user"
}
========================================
```

### 3. Check Via AWS CLI

```bash
# View logs (real-time)
aws logs tail /ecs/parlae-frontend --follow --region us-east-2

# View last 100 lines
aws logs tail /ecs/parlae-frontend --region us-east-2 --since 10m

# Search for startup message
aws logs tail /ecs/parlae-frontend --region us-east-2 --since 30m | grep "PARLAE FRONTEND STARTED" -A 15
```

### 4. Check Git SHA

**Get latest commit SHA:**
```bash
cd /Users/shaunk/Projects/Parlae-AI/parlae
git log -1 --format="%H" # Full SHA
git log -1 --format="%h" # Short SHA
```

**Compare with deployed version:**
- Check `/api/version` endpoint
- Check ECS logs for `gitCommit` field
- They should match!

### 5. Check Deployment Status

```bash
# List recent deployments
gh run list --workflow=deploy-frontend.yml --limit 5

# View latest deployment details
gh run view

# View deployment logs
gh run view --log
```

## What to Look For

### ✅ Deployment Successful If:

1. **Git SHA matches:**
   - Local: `git log -1 --format="%h"`
   - Deployed: Check `/api/version` or ECS logs
   - Should be the same!

2. **Build timestamp is recent:**
   - Should be within last 10-15 minutes of your deployment

3. **COGNITO_DOMAIN is set correctly:**
   ```json
   "cognitoDomain": "parlae-auth-2026.auth.us-east-2.amazoncognito.com"
   ```
   - NOT: "NOT_SET"
   - NOT: "parlae-auth" (truncated)
   - NOT: Contains "cognito-idp" (that's the issuer)

4. **cognitoSocialProviders shows:**
   ```json
   "cognitoSocialProviders": "Google"
   ```

5. **languagePriority shows:**
   ```json
   "languagePriority": "user"
   ```

### ❌ Issues to Watch For:

- `"cognitoDomain": "NOT_SET"` → Secret not passed correctly
- `gitCommit: "unknown"` → Build args not passed
- Old timestamp → ECS still using old image
- `cognitoSocialProviders: "NOT_SET"` → Google OAuth won't work

## Detailed Verification Steps

### Step 1: Verify Latest Commit

```bash
# In your local repo
cd /Users/shaunk/Projects/Parlae-AI/parlae
git log -1 --oneline
```

Note the commit SHA (first 7-8 characters).

### Step 2: Check Production Version

```bash
# Via API
curl https://app.parlae.ca/api/version | jq '.gitCommit'

# Or in browser, open:
# https://app.parlae.ca/api/version
```

Compare the `gitCommit` field with your local commit SHA.

### Step 3: Check ECS Task Definition

```bash
# Get current task definition
aws ecs describe-services \
  --cluster parlae-cluster \
  --services parlae-frontend \
  --region us-east-2 \
  --query 'services[0].deployments[0].taskDefinition' \
  --output text
```

Then check the task:
```bash
aws ecs describe-task-definition \
  --task-definition TASK_ARN_FROM_ABOVE \
  --region us-east-2 \
  --query 'taskDefinition.containerDefinitions[0].image'
```

Should show: `{ECR_REGISTRY}/parlae-frontend:latest`

### Step 4: Force New Deployment (If Needed)

If the logs show old code:

```bash
# Force ECS to pull latest image
aws ecs update-service \
  --cluster parlae-cluster \
  --service parlae-frontend \
  --force-new-deployment \
  --region us-east-2
```

Wait 5-10 minutes, then check logs again.

## Startup Log Format

You'll see this in ECS logs when container starts:

```
========================================
🚀 PARLAE FRONTEND STARTED
========================================
{
  "message": "Frontend Application Started",
  "version": "18",
  "gitCommit": "a1b2c3d4",                    ← Your commit
  "buildTimestamp": "2026-02-12T02:30:00Z",   ← Build time
  "startedAt": "2026-02-12T02:35:00Z",        ← Container start time
  "environment": "production",
  "authUrl": "https://app.parlae.ca",
  "cognitoIssuer": "https://cognito-idp.us-east-2.amazonaws...",
  "cognitoDomain": "parlae-auth-2026.auth.us-east-2.amazoncognito.com",
  "cognitoSocialProviders": "Google",
  "languagePriority": "user"
}
========================================
```

## CloudWatch Log Groups

Your logs are in CloudWatch at:
- **Log Group:** `/ecs/parlae-frontend`
- **Region:** `us-east-2`
- **Link:** https://console.aws.amazon.com/cloudwatch/home?region=us-east-2#logsV2:log-groups/log-group/$252Fecs$252Fparlae-frontend

## Quick Troubleshooting

### Issue: Git SHA shows "unknown"

**Cause:** Build args not passed in workflow

**Fix:** Already fixed in latest code - redeploy

### Issue: cognitoDomain shows "NOT_SET"

**Cause:** GitHub secret not set or not passed as build arg

**Fix:**
```bash
gh secret set COGNITO_DOMAIN --body "parlae-auth-2026.auth.us-east-2.amazoncognito.com"
```

Then redeploy.

### Issue: Old timestamp despite new deployment

**Cause:** ECS using cached/old Docker image

**Fix:**
```bash
# Force ECS to pull fresh image
aws ecs update-service \
  --cluster parlae-cluster \
  --service parlae-frontend \
  --force-new-deployment \
  --region us-east-2
```

### Issue: Deployment succeeded but logs show old commit

**Cause:** ECS task hasn't fully rolled over yet

**Solution:** Wait 5-10 minutes, ECS gradually replaces old tasks

**Check rollover status:**
```bash
aws ecs describe-services \
  --cluster parlae-cluster \
  --services parlae-frontend \
  --region us-east-2 \
  --query 'services[0].deployments'
```

Look for:
- `runningCount` should equal `desiredCount`
- Old deployment should have `runningCount: 0`

## Summary

**Fastest way to verify deployment:**

```bash
# 1. Get your local commit
git log -1 --format="%h"

# 2. Check what's deployed
curl https://app.parlae.ca/api/version | grep gitCommit

# 3. If they don't match, check ECS logs
aws logs tail /ecs/parlae-frontend --region us-east-2 --since 5m | grep "gitCommit"
```

If gitCommit matches → ✅ Latest code is deployed!
