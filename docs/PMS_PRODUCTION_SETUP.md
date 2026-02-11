# PMS Integration - Production Setup Guide

## 🚀 Production Configuration for parlae.ca

### Step 1: Environment Variables

Add these to your production environment (AWS ECS, Railway, Vercel, etc.):

```bash
# Production App URL
NEXT_PUBLIC_APP_URL=https://parlae.ca
NEXTAUTH_URL=https://parlae.ca

# Vapi Configuration
VAPI_API_KEY=75425176-d4b2-4957-9a5d-40b18bcce434
NEXT_PUBLIC_VAPI_PUBLIC_KEY=a55d08b7-d1d0-4b0c-a93a-00556a8d3a1d
VAPI_WEBHOOK_SECRET=parlae-vapi-webhook-secret-change-in-production

# ⚠️ IMPORTANT: Generate a strong secret for production!
# You can generate one with: openssl rand -hex 32
VAPI_WEBHOOK_SECRET=<generate-strong-secret>

# Sikka PMS (Your company credentials)
SIKKA_CLIENT_ID=b0cac8c638d52c92f9c0312159fc4518
SIKKA_CLIENT_SECRET=7beec2a9e62bd692eab2e0840b8bb2db

# Encryption key for credentials storage
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=<generate-strong-encryption-key>
```

### Step 2: Webhook URLs to Configure in Vapi Dashboard

Go to https://dashboard.vapi.ai and configure these webhooks:

**Base URL:** `https://parlae.ca`

**Tool Endpoints:**
```
1. Check Availability:
   GET https://parlae.ca/api/pms/appointments/availability

2. Book Appointment:
   POST https://parlae.ca/api/pms/appointments

3. Reschedule Appointment:
   PATCH https://parlae.ca/api/pms/appointments

4. Cancel Appointment:
   DELETE https://parlae.ca/api/pms/appointments

5. Search Patients:
   POST https://parlae.ca/api/pms/patients/search

6. Get Patient Info:
   GET https://parlae.ca/api/pms/patients/:id

7. Create Patient:
   POST https://parlae.ca/api/pms/patients

8. Add Patient Note:
   POST https://parlae.ca/api/pms/patients/:id/notes

9. Get Balance:
   GET https://parlae.ca/api/pms/patients/:id/balance

10. Get Insurance:
    GET https://parlae.ca/api/pms/patients/:id/insurance

11. Process Payment:
    POST https://parlae.ca/api/pms/payments
```

### Step 3: Vapi Assistant Configuration

The PMS tools are configured in your codebase at:
`apps/frontend/packages/shared/src/vapi/vapi-pms-tools.config.ts`

When creating/updating assistants in Vapi, import and use:

```typescript
import { PMS_TOOLS, PMS_SYSTEM_PROMPT_ADDITION } from '@kit/shared/vapi/vapi-pms-tools.config';

// When creating assistant
const assistant = await vapiClient.assistants.create({
  name: 'Dental Receptionist',
  model: {
    provider: 'openai',
    model: 'gpt-4',
    systemPrompt: `You are a dental receptionist...
    
${PMS_SYSTEM_PROMPT_ADDITION}`,
  },
  tools: PMS_TOOLS,
});
```

### Step 4: Critical - Account ID in Vapi Calls

**VERY IMPORTANT:** When creating Vapi calls, you MUST include the `accountId` in metadata:

```typescript
const call = await vapiClient.calls.create({
  assistantId: 'your-assistant-id',
  phoneNumberId: 'your-phone-id',
  metadata: {
    accountId: clinicAccount.id,  // ⚠️ REQUIRED!
    clinicName: clinicAccount.name,
  },
});
```

Without `accountId`, the webhook cannot determine which PMS credentials to use!

### Step 5: Database Migration

Make sure the PMS tables are created in production:

```bash
# On your production server/container
cd /app
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

The migration files are in:
- `packages/prisma/migrations/20260131000000_add_vapi_integration/`

### Step 6: Security Checklist

Before going live:

- [ ] Generate strong `VAPI_WEBHOOK_SECRET` (32+ characters)
- [ ] Generate strong `ENCRYPTION_KEY` (32+ characters)
- [ ] Update Sikka credentials to production keys
- [ ] Verify SSL certificate on parlae.ca
- [ ] Enable rate limiting on API routes
- [ ] Set up monitoring/alerts for PMS webhooks
- [ ] Test end-to-end with production Vapi phone number
- [ ] Review audit logs (`pms_audit_logs` table)
- [ ] Sign BAA (Business Associate Agreement) with Sikka
- [ ] Update privacy policy for PHI handling

### Step 7: DNS & SSL

Ensure parlae.ca is:
- Pointing to your production server
- Has valid SSL certificate (Let's Encrypt, CloudFlare, etc.)
- Accepting HTTPS traffic on port 443

### Step 8: Testing Production Webhooks

Use curl to test from external:

```bash
# Test search endpoint (with proper signature)
curl -X POST https://parlae.ca/api/pms/patients/search?query=test \
  -H "Content-Type: application/json" \
  -H "X-Vapi-Signature: <computed-signature>" \
  -d '{
    "call": {
      "id": "test_call_123",
      "metadata": {
        "accountId": "<real-account-id>"
      }
    },
    "data": {
      "query": "John"
    }
  }'
```

### Step 9: Monitoring

Set up monitoring for:

1. **Webhook Response Times**
   ```sql
   SELECT 
     action,
     AVG(response_time) as avg_ms,
     MAX(response_time) as max_ms
   FROM pms_audit_logs
   WHERE created_at > NOW() - INTERVAL '1 hour'
   GROUP BY action;
   ```

2. **Error Rate**
   ```sql
   SELECT 
     COUNT(*) FILTER (WHERE success = false) * 100.0 / COUNT(*) as error_rate
   FROM pms_audit_logs
   WHERE created_at > NOW() - INTERVAL '24 hours';
   ```

3. **PHI Access**
   ```sql
   SELECT 
     COUNT(*) as phi_accesses,
     COUNT(DISTINCT patient_id) as unique_patients
   FROM pms_audit_logs
   WHERE phi_accessed = true
     AND created_at > NOW() - INTERVAL '24 hours';
   ```

## 🔧 Production Deployment Commands

### Deploy to Production

```bash
# 1. Build the application
pnpm build

# 2. Run database migrations
DATABASE_URL="postgresql://..." pnpm prisma:migrate:deploy

# 3. Generate Prisma client
DATABASE_URL="postgresql://..." pnpm prisma:generate

# 4. Start production server
NODE_ENV=production pnpm start
```

### Docker Deployment

If using Docker:

```dockerfile
# Set environment variables
ENV NEXT_PUBLIC_APP_URL=https://parlae.ca
ENV VAPI_WEBHOOK_SECRET=<your-secret>
ENV ENCRYPTION_KEY=<your-key>

# Run migrations on startup
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
```

## 🎯 Quick Production Checklist

- [ ] Set `NEXT_PUBLIC_APP_URL=https://parlae.ca`
- [ ] Set strong `VAPI_WEBHOOK_SECRET`
- [ ] Set strong `ENCRYPTION_KEY`
- [ ] Run `prisma migrate deploy`
- [ ] Update Vapi assistant with PMS tools
- [ ] Test webhook with production phone number
- [ ] Verify audit logs are being created
- [ ] Set up monitoring alerts
- [ ] Document for your team

## 📞 Support

If you encounter issues:

1. Check production logs for errors
2. Verify webhook signatures are valid
3. Check `pms_audit_logs` table for failed requests
4. Ensure `accountId` is in Vapi call metadata
5. Verify Sikka credentials are correct

---

**Need Help?** Check `docs/PMS_INTEGRATION_TESTING_GUIDE.md` for detailed testing instructions.
