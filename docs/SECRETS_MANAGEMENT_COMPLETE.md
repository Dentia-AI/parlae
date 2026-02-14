# Complete Secrets Management Summary

## ✅ All Secrets Are Now Configured

### What Was Fixed

1. **Vapi API Integration** - Missing frontend secrets for file uploads
2. **Text-to-Speech APIs** - ElevenLabs and OpenAI keys for voice previews  
3. **Twilio** - Account credentials for SMS/voice features
4. **Twilio Messaging Service** - Placeholder added (needs real value)

### Current Deployment Status

Both services are redeploying with the new secrets:
- **Frontend**: Transitioning to new task with all secrets
- **Backend**: Transitioning to new task with all secrets

Expected completion: 2-3 minutes from when redeployment started.

---

## 📋 Complete Secrets Inventory

### Frontend Secrets (24)
```
/parlae/frontend/NEXTAUTH_URL
/parlae/frontend/NEXTAUTH_SECRET
/parlae/frontend/COGNITO_CLIENT_ID
/parlae/frontend/COGNITO_CLIENT_SECRET
/parlae/frontend/COGNITO_ISSUER
/parlae/frontend/COGNITO_DOMAIN
/parlae/frontend/DATABASE_URL
/parlae/frontend/BACKEND_API_URL
/parlae/frontend/DISCOURSE_SSO_SECRET
/parlae/frontend/GHL_API_KEY
/parlae/frontend/GHL_LOCATION_ID
/parlae/frontend/NEXT_PUBLIC_GHL_WIDGET_ID
/parlae/frontend/NEXT_PUBLIC_GHL_LOCATION_ID
/parlae/frontend/NEXT_PUBLIC_GHL_CALENDAR_ID
/parlae/frontend/GOOGLE_CLIENT_ID
/parlae/frontend/GOOGLE_CLIENT_SECRET
/parlae/frontend/VAPI_API_KEY ⭐
/parlae/frontend/NEXT_PUBLIC_VAPI_PUBLIC_KEY ⭐
/parlae/frontend/VAPI_SERVER_SECRET ⭐
/parlae/frontend/ELEVENLABS_API_KEY ⭐
/parlae/frontend/OPENAI_API_KEY ⭐
/parlae/frontend/TWILIO_ACCOUNT_SID ⭐
/parlae/frontend/TWILIO_AUTH_TOKEN ⭐
/parlae/frontend/ADMIN_USER_IDS
```

### Backend Secrets (9)
```
/parlae/backend/DATABASE_URL
/parlae/backend/SIKKA_APP_ID
/parlae/backend/SIKKA_APP_KEY
/parlae/backend/VAPI_API_KEY
/parlae/backend/VAPI_WEBHOOK_SECRET
/parlae/backend/TWILIO_ACCOUNT_SID
/parlae/backend/TWILIO_AUTH_TOKEN
/parlae/backend/TWILIO_MESSAGING_SERVICE_SID ⚠️ (placeholder)
/parlae/backend/APP_BASE_URL
```

### Shared Secrets (8)
```
/parlae/shared/AWS_REGION
/parlae/shared/S3_BUCKET
/parlae/shared/COGNITO_USER_POOL_ID
/parlae/shared/COGNITO_CLIENT_ID
/parlae/shared/COGNITO_ISSUER
/parlae/shared/STRIPE_SECRET_KEY
/parlae/shared/STRIPE_WEBHOOK_SECRET
/parlae/shared/STRIPE_PUBLISHABLE_KEY
```

⭐ = Newly added  
⚠️ = Needs real value

---

## 🔧 New Scripts Created

### 1. Check Missing Secrets
`/scripts/check-missing-secrets.sh`

Audits all secrets defined in ECS task definitions against what exists in SSM.

**Usage:**
```bash
./scripts/check-missing-secrets.sh
```

### 2. Add Vapi Frontend Secrets
`/scripts/add-vapi-secrets-to-frontend.sh`

Adds the 3 Vapi secrets needed for frontend file uploads.

**Usage:**
```bash
VAPI_API_KEY=xxx \
NEXT_PUBLIC_VAPI_PUBLIC_KEY=xxx \
VAPI_SERVER_SECRET=xxx \
./scripts/add-vapi-secrets-to-frontend.sh
```

### 3. Add Vapi Backend Secrets (Existing)
`/scripts/add-vapi-secrets-to-backend.sh`

Adds Vapi webhook secrets to backend task definition.

---

## ⚠️ Action Required

### Update Twilio Messaging Service SID

The backend has a placeholder value. To update:

1. **Get the real value from Twilio:**
   - Login to https://console.twilio.com
   - Navigate to Messaging > Services
   - Copy the Messaging Service SID (starts with "MG")

2. **Update in SSM:**
```bash
aws ssm put-parameter \
  --name "/parlae/backend/TWILIO_MESSAGING_SERVICE_SID" \
  --value "MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  --type "SecureString" \
  --region us-east-2 \
  --profile parlae \
  --overwrite
```

3. **Redeploy backend:**
```bash
aws ecs update-service \
  --cluster parlae-cluster \
  --service parlae-backend \
  --force-new-deployment \
  --region us-east-2 \
  --profile parlae
```

---

## 🧪 Testing

### Test Vapi File Upload (Primary Issue)

1. Go to https://app.parlae.ca
2. Navigate to Voice Agent settings
3. Upload a knowledge base file
4. Should succeed without "missing API key" error

### Test Voice Preview

1. Go to Voice Agent configuration
2. Try to preview a voice
3. Should work with ElevenLabs/OpenAI

### Check Logs

```bash
# Frontend
aws logs tail /ecs/parlae-frontend --follow --region us-east-2 --profile parlae

# Backend  
aws logs tail /ecs/parlae-backend --follow --region us-east-2 --profile parlae
```

---

## 📚 Related Documentation

- `/docs/SSM_SECRETS_AUDIT_2026_02_14.md` - Detailed audit report
- `/docs/VAPI_WEBHOOK_CONFIGURATION.md` - Vapi webhook setup
- `/scripts/verify-deployment.sh` - Deployment verification script

---

## 🔄 Future Maintenance

### When Adding New Secrets

1. Add to appropriate section in `/parlae-infra/infra/ecs/services.tf`
2. Create the secret in SSM Parameter Store:
```bash
aws ssm put-parameter \
  --name "/parlae/{frontend|backend|shared}/SECRET_NAME" \
  --value "secret_value" \
  --type "SecureString" \
  --region us-east-2 \
  --profile parlae
```
3. Redeploy the affected service
4. Run `check-missing-secrets.sh` to verify

### Regular Audit

Run the audit script monthly:
```bash
./scripts/check-missing-secrets.sh
```

This ensures all ECS task definition secrets exist in SSM.
