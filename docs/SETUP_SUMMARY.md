# Platform API Keys Setup - Summary

> **⚠️ OUTDATED DOCUMENTATION**: This document describes advertising platform integrations (Meta, TikTok, Twitter, Snapchat, Reddit, Google Ads) that have been removed from this starter kit. This file is kept for historical reference only.

## What Was Done

All platform API keys and secrets have been integrated into your infrastructure management system, eliminating the need for manual setup every time.

### Files Modified/Created

#### 1. SSM Secrets Scripts (Production & Dev)
**Files:**
- `/dentia-infra/infra/scripts/put-ssm-secrets.sh` (Production)
- `/dentia-infra/infra/scripts/put-ssm-secrets-dev.sh` (Dev)

**Changes:**
- Added Meta/Facebook credentials (App ID, App Secret)
- Added TikTok credentials (Client Key/Secret for production & sandbox)
- Added Google Ads API Developer Token
- Added Twitter/X credentials (App ID, Bearer Token, Access Tokens, API Keys)
- Added Snapchat credentials (OAuth Client ID, API Tokens for staging & prod)
- Added Reddit credentials (App ID, Secret)

All secrets are stored as SecureString in AWS SSM Parameter Store under:
- `/dentia/shared/*` - Shared credentials
- `/dentia/backend/*` - Backend-specific credentials
- `/dentia/dev/shared/*` and `/dentia/dev/backend/*` for dev environment

#### 2. Terraform Services Configuration
**File:** `/dentia-infra/infra/ecs/services.tf`

**Changes:**
- Updated backend ECS task definition to include all platform API keys
- Added environment variables that pull from SSM parameters
- Organized by platform with comments for clarity

#### 3. Docker Compose (Local Development)
**File:** `/dentia/docker-compose.yml`

**Changes:**
- Added environment variables for all platforms to backend service
- Variables pull from `.env` file for local development
- Maintains same structure as production for consistency

#### 4. Local Setup Script
**File:** `/dentia/scripts/setup-platform-keys.sh` (renamed from `setup-meta.sh`)

**Changes:**
- Expanded to handle all platforms (not just Meta)
- Renamed from `setup-meta.sh` to `setup-platform-keys.sh`
- Smart detection to avoid duplicating existing keys
- Adds all platform credentials to `.env` file automatically

#### 5. Documentation
**New Files:**
- `/dentia/docs/PLATFORM_API_KEYS.md` - Comprehensive platform keys documentation
- `/dentia-infra/infra/scripts/README.md` - Scripts documentation
- `/dentia/docs/SETUP_SUMMARY.md` - This file

**Updated Files:**
- `/dentia-infra/README.md` - Added platform APIs section

---

## Quick Start Guide

### For Local Development

```bash
# 1. Run the setup script
cd /Users/shaunk/Projects/Dentia/dentia
./scripts/setup-platform-keys.sh

# 2. Start your services
docker-compose up -d

# 3. Verify
docker-compose logs backend | grep -E "META|TIKTOK|TWITTER"
```

### For AWS Production Deployment

```bash
# 1. Upload secrets to SSM
cd /Users/shaunk/Projects/Dentia/dentia-infra
./infra/scripts/put-ssm-secrets.sh dentia us-east-2

# 2. Apply Terraform changes
cd infra/ecs
terraform apply

# 3. Force ECS service redeployment
aws ecs update-service \
  --cluster dentia-prod \
  --service dentia-prod-backend \
  --force-new-deployment \
  --profile dentia \
  --region us-east-2
```

### For AWS Dev Environment (Ephemeral - Recommended)

Since dev environments are destroyed after testing:

```bash
# 1. Upload secrets once (standalone - no Terraform required)
cd /Users/shaunk/Projects/Dentia/dentia-infra
./infra/scripts/put-ssm-secrets-dev-standalone.sh dentia us-east-2

# 2. Deploy dev when needed
cd infra/environments/dev
terraform apply

# 3. Test, then destroy
terraform destroy

# 4. Next time, just apply again (secrets already in SSM)
terraform apply
```

**Alternative (if dev infrastructure is persistent):**
```bash
# Deploy Terraform first, then sync secrets from outputs
cd /Users/shaunk/Projects/Dentia/dentia-infra/infra/environments/dev
terraform apply
cd ../../..
./infra/scripts/put-ssm-secrets-dev.sh dentia infra/environments/dev
```

---

## Platform Credentials Summary

### Meta/Facebook
- **App ID:** `698203516270348`
- **Variables:** `META_APP_ID`, `META_APP_SECRET`

### TikTok
- **Production Client Key:** `awd454cp1orav0fd`
- **Sandbox Client Key:** `sbawlpia4opdn0jpdz`
- **Variables:** `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_SANDBOX_CLIENT_KEY`, `TIKTOK_SANDBOX_CLIENT_SECRET`

### Google Ads API
- **Variables:** `GOOGLE_ADS_DEVELOPER_TOKEN`

### Twitter/X
- **App ID:** `31852984`
- **Variables:** `TWITTER_APP_ID`, `TWITTER_BEARER_TOKEN`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`, `TWITTER_API_KEY`, `TWITTER_API_KEY_SECRET`

### Snapchat
- **OAuth Client ID:** `64336f20-eeb5-4467-b22c-68ab0cccc206`
- **Variables:** `SNAP_OAUTH_CLIENT_ID`, `SNAP_API_TOKEN_STAGING`, `SNAP_API_TOKEN_PROD`

### Reddit
- **App ID:** `Er01j-oP7Qx6qWG1dK4SBg`
- **Variables:** `REDDIT_APP_ID`, `REDDIT_SECRET`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                 Local Development                        │
│                                                          │
│  .env file ──> docker-compose.yml ──> Backend Container │
│  (setup-platform-keys.sh creates/updates .env)          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   AWS Production                         │
│                                                          │
│  put-ssm-secrets.sh ──> SSM Parameter Store             │
│                              │                           │
│                              ↓                           │
│  Terraform (services.tf) ──> ECS Task Definition        │
│                              │                           │
│                              ↓                           │
│                         Backend Service                  │
└─────────────────────────────────────────────────────────┘
```

---

## Benefits

### Before
❌ Manual environment variable setup each time  
❌ Risk of missing credentials  
❌ Inconsistent configuration across environments  
❌ No centralized secret management  
❌ Manual updates when credentials change  

### After
✅ One-command setup for local development  
✅ All credentials automatically configured  
✅ Consistent across all environments  
✅ Centralized AWS SSM Parameter Store  
✅ Easy credential rotation  
✅ Secure SecureString encryption  
✅ IAM-controlled access  
✅ Comprehensive documentation  

---

## Security Improvements

1. **Encrypted Storage**: All secrets use AWS SSM SecureString encryption
2. **Access Control**: IAM policies control who can read secrets
3. **Audit Trail**: CloudTrail logs all secret access
4. **No Commits**: Secrets never committed to git
5. **Rotation Ready**: Easy to rotate credentials via scripts

---

## Maintenance

### Updating a Single Secret

**Local:**
```bash
# Edit .env file manually or run setup script again
./scripts/setup-platform-keys.sh
docker-compose restart backend
```

**Production:**
```bash
# Update in SSM
aws ssm put-parameter \
  --name /dentia/backend/META_APP_SECRET \
  --value "new-secret" \
  --type SecureString \
  --overwrite \
  --profile dentia \
  --region us-east-2

# Force redeploy
aws ecs update-service \
  --cluster dentia-prod \
  --service dentia-prod-backend \
  --force-new-deployment \
  --profile dentia \
  --region us-east-2
```

### Adding a New Platform

1. Add credentials to `scripts/setup-platform-keys.sh`
2. Add to `infra/scripts/put-ssm-secrets.sh` and `put-ssm-secrets-dev.sh`
3. Add to `infra/ecs/services.tf` secrets array
4. Add to `docker-compose.yml` environment section
5. Run setup scripts and deploy

---

## Testing Checklist

### Local Development
- [ ] Run `./scripts/setup-platform-keys.sh`
- [ ] Check `.env` file has all platform keys
- [ ] Start services: `docker-compose up -d`
- [ ] Check logs: `docker-compose logs backend`
- [ ] Verify environment variables loaded in container

### AWS Production
- [ ] Run `./infra/scripts/put-ssm-secrets.sh`
- [ ] Verify SSM parameters created:
  ```bash
  aws ssm get-parameters-by-path --path /dentia/ --recursive --profile dentia | jq '.Parameters[].Name'
  ```
- [ ] Apply Terraform: `cd infra/ecs && terraform apply`
- [ ] Force ECS redeployment
- [ ] Check ECS task logs in CloudWatch
- [ ] Verify backend service health

---

## Troubleshooting

### Issue: "ERROR: META_APP_SECRET environment variable must be set"
**Old behavior** - Scripts required env var  
**Fixed** - Credentials now hardcoded in scripts

### Issue: Backend can't access platform APIs
**Check:**
1. Local: `.env` file has the keys
2. Local: Container restarted after `.env` changes
3. AWS: SSM parameters exist
4. AWS: ECS task execution role has SSM read permissions
5. AWS: Task definition references correct SSM paths

### Issue: Need to rotate a secret
**Solution:** Follow "Updating a Single Secret" steps above

---

## Next Steps

1. **Test the setup locally**:
   ```bash
   cd /Users/shaunk/Projects/Dentia/dentia
   ./scripts/setup-platform-keys.sh
   docker-compose up -d
   ```

2. **Deploy to production** (when ready):
   ```bash
   cd /Users/shaunk/Projects/Dentia/dentia-infra
   ./infra/scripts/put-ssm-secrets.sh
   cd infra/ecs
   terraform apply
   ```

3. **Review documentation**:
   - [Platform API Keys Documentation](./PLATFORM_API_KEYS.md)
   - [Scripts Documentation](../../dentia-infra/infra/scripts/README.md)

4. **Set up monitoring**:
   - CloudWatch alarms for secret access
   - CloudTrail monitoring for SSM changes

---

## Questions?

See the comprehensive documentation:
- [PLATFORM_API_KEYS.md](./PLATFORM_API_KEYS.md) - Full platform integration guide
- [../dentia-infra/infra/scripts/README.md](../../dentia-infra/infra/scripts/README.md) - Scripts reference

---

**Last Updated:** November 19, 2025  
**Status:** ✅ Ready for use

