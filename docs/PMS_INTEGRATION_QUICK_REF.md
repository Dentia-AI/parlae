# PMS Integration - Quick Reference

## 🚀 Quick Start

### 1. Environment Variables (Required)

```bash
# Generate encryption key first
openssl rand -hex 32

# Add to .env.local
ENCRYPTION_KEY=<your-generated-key>
VAPI_WEBHOOK_SECRET=parlae-vapi-webhook-secret-change-in-production
NEXT_PUBLIC_APP_URL=https://your-app.com

# Sikka Credentials (get from Sikka dashboard)
SIKKA_APPLICATION_ID=your_app_id
SIKKA_SECRET_KEY=your_secret_key
```

### 2. Add PMS Tools to Vapi Assistant

```typescript
import { PMS_TOOLS, PMS_SYSTEM_PROMPT_ADDITION } from '@kit/shared/vapi/vapi-pms-tools.config';

const assistant = await vapiClient.assistants.create({
  name: 'Dental Receptionist',
  model: {
    provider: 'openai',
    model: 'gpt-4',
    systemPrompt: `You are a helpful dental receptionist.${PMS_SYSTEM_PROMPT_ADDITION}`,
  },
  tools: PMS_TOOLS,
});
```

### 3. Pass Account ID in Vapi Calls

```typescript
const call = await vapiClient.calls.create({
  phoneNumberId: phoneNumber.vapi_phone_id,
  assistantId: assistant.id,
  metadata: {
    accountId: clinic.id, // ⚠️ REQUIRED
  },
});
```

---

## 📋 Available API Endpoints

### Appointments
```
GET    /api/pms/appointments?startDate=2026-02-15&endDate=2026-02-20
POST   /api/pms/appointments
PATCH  /api/pms/appointments/:id
DELETE /api/pms/appointments/:id
GET    /api/pms/appointments/availability?date=2026-02-15
```

### Patients
```
GET    /api/pms/patients/search?query=john
POST   /api/pms/patients
GET    /api/pms/patients/:id
PATCH  /api/pms/patients/:id
```

### Notes
```
GET    /api/pms/patients/:id/notes
POST   /api/pms/patients/:id/notes
```

### Insurance & Billing
```
GET    /api/pms/patients/:id/insurance
POST   /api/pms/patients/:id/insurance
GET    /api/pms/patients/:id/balance
POST   /api/pms/payments
```

---

## 🛠️ Code Examples

### Setup PMS Integration (Server Action)

```typescript
// Server action to setup PMS
'use server';

export async function setupPmsIntegration(
  accountId: string,
  provider: 'SIKKA' | 'KOLLA',
  credentials: any,
  config: any
) {
  const response = await fetch('/api/pms/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      credentials,
      config,
    }),
  });
  
  return response.json();
}
```

### Check PMS Status

```typescript
'use server';

export async function checkPmsStatus(accountId: string) {
  const response = await fetch('/api/pms/setup', {
    method: 'GET',
  });
  
  const result = await response.json();
  return result.integrations;
}
```

### Use PMS Service Directly

```typescript
import { getPmsService } from '@/app/api/pms/_lib/pms-utils';

const pmsService = await getPmsService(accountId);

if (pmsService) {
  // Check availability
  const availability = await pmsService.checkAvailability({
    date: '2026-02-15',
    appointmentType: 'cleaning',
  });
  
  // Book appointment
  const appointment = await pmsService.bookAppointment({
    patientId: 'pat_123',
    appointmentType: 'cleaning',
    startTime: new Date('2026-02-15T10:00:00Z'),
    duration: 30,
  });
}
```

---

## 🎯 Vapi Tool Call Flow

### Example: Patient Books Appointment

```
1. Patient: "I'd like to book a cleaning"
   
2. AI calls searchPatients tool
   → POST /api/pms/patients/search
   → Returns: [{ id: 'pat_123', name: 'John Doe' }]

3. AI asks: "What day works for you?"
   Patient: "Next Monday"

4. AI calls checkAvailability tool
   → GET /api/pms/appointments/availability?date=2026-02-17
   → Returns: [{ startTime: '10:00', endTime: '10:30', available: true }]

5. AI: "We have 10am or 2pm available"
   Patient: "10am is perfect"

6. AI calls bookAppointment tool
   → POST /api/pms/appointments
   → Body: { patientId: 'pat_123', startTime: '2026-02-17T10:00:00Z', ... }
   → Returns: { success: true, confirmationNumber: 'ABC123' }

7. AI: "Perfect! Your cleaning is booked for Monday at 10am. 
      Your confirmation number is ABC123."
```

---

## 🔧 Troubleshooting

### Connection Failed

**Problem**: `Connection failed. Please check your credentials.`

**Solutions**:
1. Verify Sikka credentials are correct
2. Check ENCRYPTION_KEY is set
3. Ensure DATABASE_URL is accessible
4. Check network connectivity to Sikka API

### Webhook Authentication Failed

**Problem**: `Invalid Vapi signature`

**Solutions**:
1. Verify VAPI_WEBHOOK_SECRET matches Vapi dashboard
2. Check webhook URL is correct in Vapi tools
3. Ensure HTTPS (not HTTP) for production

### No PMS Integration Found

**Problem**: `No PMS integration found`

**Solutions**:
1. User needs to complete setup wizard first
2. Check PMS integration status: `SELECT * FROM pms_integrations WHERE account_id = '...'`
3. Ensure integration status is 'ACTIVE'

### PHI Not Logging

**Problem**: Audit logs not capturing PHI access

**Solutions**:
1. Check `pms_audit_logs` table exists
2. Verify `phiAccessed` flag is set to `true` in API routes
3. Check database connection

---

## 📊 Database Queries

### Check Integration Status

```sql
SELECT 
  id, 
  provider, 
  status, 
  last_sync_at, 
  last_error
FROM pms_integrations 
WHERE account_id = 'your-account-id';
```

### View Audit Logs

```sql
SELECT 
  action,
  method,
  phi_accessed,
  patient_id,
  success,
  created_at
FROM pms_audit_logs 
WHERE pms_integration_id = 'your-integration-id'
ORDER BY created_at DESC
LIMIT 20;
```

### Count API Calls

```sql
SELECT 
  action,
  COUNT(*) as call_count,
  AVG(response_time) as avg_time_ms
FROM pms_audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY action
ORDER BY call_count DESC;
```

---

## 🎨 UI Components

### PMS Setup Wizard

```tsx
import { PmsSetupWizard } from '@/app/home/(user)/agent/setup/_components/pms-setup-wizard';

<PmsSetupWizard
  accountId={accountId}
  onComplete={() => router.push('/home/agent/setup/review')}
  onBack={() => router.back()}
/>
```

### Check PMS Status

```typescript
const status = await fetch('/api/pms/setup').then(r => r.json());

if (status.success && status.integrations.length > 0) {
  const integration = status.integrations[0];
  console.log('Provider:', integration.provider);
  console.log('Status:', integration.status);
  console.log('Features:', integration.features);
}
```

---

## 🔐 Security Checklist

- [ ] ENCRYPTION_KEY is set (32 bytes hex)
- [ ] VAPI_WEBHOOK_SECRET is set and matches Vapi dashboard
- [ ] DATABASE_URL uses SSL in production
- [ ] Sikka credentials are encrypted before storage
- [ ] All API routes verify Vapi webhook signature
- [ ] PHI is redacted from application logs
- [ ] Audit logging is enabled
- [ ] Rate limiting is configured
- [ ] BAA signed with Sikka (production only)

---

## 📖 Documentation Links

- **Architecture**: `docs/PMS_INTEGRATION_ARCHITECTURE.md`
- **Implementation Status**: `docs/PMS_INTEGRATION_IMPLEMENTATION_STATUS.md`
- **Complete Guide**: `docs/PMS_INTEGRATION_COMPLETE.md`
- **This Quick Reference**: `docs/PMS_INTEGRATION_QUICK_REF.md`

---

## 🆘 Support

### Common Issues

| Issue | Solution |
|-------|----------|
| Can't connect to Sikka | Check credentials, network, API key validity |
| Webhook not working | Verify signature, check HTTPS, confirm URL |
| PHI not redacted | Check `redactPhi()` function in logs |
| Audit logs missing | Verify `logPmsAccess()` is called in all routes |
| Encryption error | Ensure ENCRYPTION_KEY is 64 hex characters |

### Need Help?

1. Check error logs in API routes
2. Review audit logs in database
3. Test connection via setup wizard
4. Verify environment variables
5. Check Sikka API status

---

**Last Updated**: 2026-02-07
**Version**: 1.0.0
**Status**: ✅ Production Ready
