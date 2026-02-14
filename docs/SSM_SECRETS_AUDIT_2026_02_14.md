# AWS SSM Parameter Store Secrets Audit and Fix

**Date:** February 14, 2026

## Issue
File upload to Vapi was failing in production with error:
```
POST https://app.parlae.ca/api/vapi/upload-file 500 (Internal Server Error)
[Vapi] Integration disabled - missing API key
```

The issue was that the `VAPI_API_KEY` and other secrets were not present in AWS SSM Parameter Store, even though the ECS task definitions were configured to read them.

## Root Cause
The Vapi secrets (and several other secrets) were missing from AWS SSM Parameter Store. While the Terraform configuration in `parlae-infra/infra/ecs/services.tf` referenced these secrets, they were never actually created in AWS.

## Solution

### 1. Created Frontend Vapi Secrets Script
Created `/scripts/add-vapi-secrets-to-frontend.sh` to add:
- `VAPI_API_KEY`
- `NEXT_PUBLIC_VAPI_PUBLIC_KEY`
- `VAPI_SERVER_SECRET`

### 2. Created Secrets Audit Script
Created `/scripts/check-missing-secrets.sh` to audit all secrets defined in the ECS task definitions and verify they exist in SSM Parameter Store.

### 3. Added Missing Secrets

#### Frontend Missing Secrets (Added):
- ✅ `/parlae/frontend/ELEVENLABS_API_KEY`
- ✅ `/parlae/frontend/OPENAI_API_KEY`
- ✅ `/parlae/frontend/TWILIO_ACCOUNT_SID`
- ✅ `/parlae/frontend/TWILIO_AUTH_TOKEN`
- ✅ `/parlae/frontend/VAPI_API_KEY`
- ✅ `/parlae/frontend/NEXT_PUBLIC_VAPI_PUBLIC_KEY`
- ✅ `/parlae/frontend/VAPI_SERVER_SECRET`

#### Backend Missing Secrets (Added):
- ✅ `/parlae/backend/TWILIO_MESSAGING_SERVICE_SID` (placeholder - needs real value)

### 4. Forced ECS Redeployments
Both frontend and backend services were redeployed to pick up the new secrets:
```bash
aws ecs update-service --cluster parlae-cluster --service parlae-frontend --force-new-deployment
aws ecs update-service --cluster parlae-cluster --service parlae-backend --force-new-deployment
```

## All Current Secrets in SSM

### Frontend Secrets (24 total)
1. NEXTAUTH_URL
2. NEXTAUTH_SECRET
3. COGNITO_CLIENT_ID
4. COGNITO_CLIENT_SECRET
5. COGNITO_ISSUER
6. COGNITO_DOMAIN
7. DATABASE_URL
8. BACKEND_API_URL
9. DISCOURSE_SSO_SECRET
10. GHL_API_KEY
11. GHL_LOCATION_ID
12. NEXT_PUBLIC_GHL_WIDGET_ID
13. NEXT_PUBLIC_GHL_LOCATION_ID
14. NEXT_PUBLIC_GHL_CALENDAR_ID
15. GOOGLE_CLIENT_ID
16. GOOGLE_CLIENT_SECRET
17. VAPI_API_KEY ⭐ (newly added)
18. NEXT_PUBLIC_VAPI_PUBLIC_KEY ⭐ (newly added)
19. VAPI_SERVER_SECRET ⭐ (newly added)
20. ELEVENLABS_API_KEY ⭐ (newly added)
21. OPENAI_API_KEY ⭐ (newly added)
22. TWILIO_ACCOUNT_SID ⭐ (newly added)
23. TWILIO_AUTH_TOKEN ⭐ (newly added)
24. ADMIN_USER_IDS

### Backend Secrets (9 total)
1. DATABASE_URL
2. SIKKA_APP_ID
3. SIKKA_APP_KEY
4. VAPI_API_KEY
5. VAPI_WEBHOOK_SECRET
6. TWILIO_ACCOUNT_SID
7. TWILIO_AUTH_TOKEN
8. TWILIO_MESSAGING_SERVICE_SID ⭐ (newly added - placeholder)
9. APP_BASE_URL

### Shared Secrets (8 total)
1. AWS_REGION
2. S3_BUCKET
3. COGNITO_USER_POOL_ID
4. COGNITO_CLIENT_ID
5. COGNITO_ISSUER
6. STRIPE_SECRET_KEY
7. STRIPE_WEBHOOK_SECRET
8. STRIPE_PUBLISHABLE_KEY

## Action Required

⚠️ **Update TWILIO_MESSAGING_SERVICE_SID**: The backend has a placeholder value for `TWILIO_MESSAGING_SERVICE_SID`. You need to:

1. Get the actual Messaging Service SID from your Twilio account (starts with "MG")
2. Update it in SSM:
```bash
aws ssm put-parameter \
  --name "/parlae/backend/TWILIO_MESSAGING_SERVICE_SID" \
  --value "MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  --type "SecureString" \
  --region us-east-2 \
  --profile parlae \
  --overwrite
```
3. Force redeploy backend:
```bash
aws ecs update-service \
  --cluster parlae-cluster \
  --service parlae-backend \
  --force-new-deployment \
  --region us-east-2 \
  --profile parlae
```

## Useful Scripts

### Check for Missing Secrets
```bash
./scripts/check-missing-secrets.sh
```

### Add Frontend Vapi Secrets
```bash
VAPI_API_KEY=xxx \
NEXT_PUBLIC_VAPI_PUBLIC_KEY=xxx \
VAPI_SERVER_SECRET=xxx \
./scripts/add-vapi-secrets-to-frontend.sh
```

### Force ECS Redeploy
```bash
# Frontend
aws ecs update-service --cluster parlae-cluster --service parlae-frontend --force-new-deployment --region us-east-2 --profile parlae

# Backend
aws ecs update-service --cluster parlae-cluster --service parlae-backend --force-new-deployment --region us-east-2 --profile parlae
```

## Verification

After the ECS services redeploy (2-3 minutes), verify:

1. **Check deployment status:**
```bash
aws ecs describe-services \
  --cluster parlae-cluster \
  --services parlae-frontend parlae-backend \
  --region us-east-2 \
  --profile parlae \
  --query 'services[*].{name:serviceName,running:runningCount,desired:desiredCount}'
```

2. **Test file upload to Vapi:**
- Go to https://app.parlae.ca
- Navigate to Voice Agent settings
- Try uploading a knowledge base file
- Should now succeed without "missing API key" error

3. **Check logs:**
```bash
# Frontend logs
aws logs tail /ecs/parlae-frontend --follow --region us-east-2 --profile parlae

# Backend logs
aws logs tail /ecs/parlae-backend --follow --region us-east-2 --profile parlae
```

## Status
✅ All secrets configured
✅ Frontend redeployed
✅ Backend redeployed
⚠️ Twilio Messaging Service SID needs real value (placeholder currently)
