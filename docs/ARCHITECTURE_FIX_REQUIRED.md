# Critical Architecture Issues & Fixes Required

## Issue 1: Sikka Architecture Misunderstanding ❌

### Current (WRONG) Implementation
```
Frontend PMS Selection:
[ ] Sikka
[ ] Kolla  
[ ] Dentrix
[ ] Eaglesoft

Backend:
- ONE set of Sikka credentials for ALL practices ❌
- SIKKA_APP_ID and SIKKA_APP_KEY in environment
```

### Correct Architecture ✅

**Sikka is NOT a PMS choice** - It's a middleware API that connects to various PMS systems.

```
Actual PMS Systems:
- Dentrix
- Eaglesoft  
- Open Dental
- Practice Works
- Dolphin
- etc.

Sikka = Middleware Layer between Parlae ←→ Any PMS
```

### How Sikka Really Works

```
Parlae Backend
     ↓ (uses shared app_id, app_key)
   Sikka API
     ↓ (connects to practice via SPU)
Practice PMS (Dentrix, Eaglesoft, etc.)
     ↓ (data on practice server)
  Patient Data
```

**Per-Practice Flow**:
1. Clinic installs **Sikka SPU** on their practice server
2. SPU connects their PMS (Dentrix/Eaglesoft) to Sikka cloud
3. Clinic "authorizes" Parlae app in Sikka marketplace
4. Sikka generates unique credentials: `office_id` + `secret_key`
5. Parlae calls `/authorized_practices` to get these credentials
6. Parlae stores per-practice credentials in **AWS Secrets Manager**

---

## Issue 2: Credential Storage Architecture ❌

### Current (WRONG)
```typescript
// ONE set of credentials for ALL practices
SIKKA_APP_ID=shared_app_id      // ✅ Correct (shared)
SIKKA_APP_KEY=shared_app_key    // ✅ Correct (shared)

// NO per-practice credentials ❌
```

### Correct Architecture ✅

**Two levels of credentials**:

1. **System-level (shared)** - In environment:
   ```bash
   SIKKA_APP_ID=b0cac8c638d52c92f9c0312159fc4518
   SIKKA_APP_KEY=7beec2a9e62bd692eab2e0840b8bb2db
   ```

2. **Practice-level (per-account)** - In AWS Secrets Manager:
   ```
   Secret: parlae/pms/sikka/{accountId}
   Value: {
     "officeId": "D36225",
     "secretKey": "STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0=",
     "practiceName": "Happy Dental Clinic",
     "practiceId": "1-1",
     "requestKey": "70a2c702705ad41c395f8bd639fa7f85",
     "refreshKey": "yyyy-yyyy-yyyy-yyyy",
     "tokenExpiry": "2026-02-11T04:00:28Z"
   }
   ```

**Database stores ONLY**:
```typescript
{
  accountId: "account_123",
  provider: "SIKKA",
  secretArn: "arn:aws:secretsmanager:us-east-1:xxx:secret:parlae/pms/sikka/account_123",
  status: "ACTIVE",
  features: { appointments: true, patients: true },
  lastSyncAt: "2026-02-11T12:00:00Z"
}
```

---

## Issue 3: Missing Sikka Registration Webhook ❌

**The Problem**: How does Parlae know when a practice installs SPU?

**The Solution**: Sikka sends a webhook when practice authorizes your app.

### Required Endpoint

**POST** `/api/sikka/webhook/authorize`

```typescript
// Sikka sends this when practice authorizes Parlae
{
  "event": "app.authorized",
  "app_id": "b0cac8c638d52c92f9c0312159fc4518",
  "office_id": "D36225",
  "secret_key": "STc3kSY7S4ORJHb5hE0r5yBwdeCFu7av0ahG9hPlDj0=",
  "practice_name": "Happy Dental Clinic",
  "practice_id": "1-1"
}
```

**Our Backend Response**:
1. Verify webhook signature
2. Get or create account for this practice
3. Generate request_key tokens
4. Store in AWS Secrets Manager
5. Save integration record in database
6. Return success

---

## Issue 4: Patient Management Tools Missing ❌

### Required Vapi Tools

Current: 4 tools (1 working, 3 placeholders)
Required: 8 tools

**Missing**:
- ❌ `createPatient` - Create new patient record
- ❌ `updatePatient` - Update patient info
- ❌ `searchPatients` - Search by phone/name (currently in getPatientInfo)
- ❌ `cancelAppointment` - Cancel existing appointment

**All patient tools MUST be HIPAA compliant** (see Issue 5)

---

## Issue 5: HIPAA Compliance ❌

### Current Status: NOT COMPLIANT

**Required for HIPAA**:
- [ ] Audit logging of all PHI access
- [ ] Encryption in transit (TLS) ✅ Already have
- [ ] Encryption at rest for PHI fields
- [ ] Access control and authentication ✅ Already have
- [ ] PHI field redaction in logs
- [ ] Consent tracking
- [ ] Data retention policies
- [ ] Breach notification procedures

### Required Changes

#### 1. Add Audit Logging
```typescript
// Every patient data access must be logged
await prisma.pmsAuditLog.create({
  data: {
    pmsIntegrationId: integration.id,
    action: 'getPatientInfo',
    endpoint: '/patients/{id}',
    method: 'GET',
    userId: session.userId,
    vapiCallId: call.id,
    ipAddress: request.ip,
    requestSummary: 'Accessed patient PHI during call',
    responseStatus: 200,
    responseTime: 150,
    phiAccessed: true,
    phiFields: ['name', 'phone', 'dateOfBirth'],
  }
});
```

#### 2. PHI Field Encryption in Database
```prisma
model Patient {
  // Store PHI fields encrypted
  phone_encrypted String @map("phone_encrypted") // AES-256-GCM
  email_encrypted String @map("email_encrypted")
  dob_encrypted   String @map("dob_encrypted")
}
```

#### 3. Log Redaction
```typescript
// NEVER log PHI in plain text
logger.info({ 
  patientId: 'pat_123',  // ✅ OK
  patientName: 'John Doe' // ❌ NEVER DO THIS
});

// Instead:
logger.info({ 
  patientId: 'pat_123',
  action: 'accessed_patient_info'
});
```

---

## Issue 6: Frontend PMS Selection UI Wrong ❌

### Current (WRONG)
```typescript
<select>
  <option value="SIKKA">Sikka</option>
  <option value="DENTRIX">Dentrix</option>
  <option value="EAGLESOFT">Eaglesoft</option>
</select>
```

### Correct ✅

**Option A: Sikka Marketplace Integration (Recommended)**
```typescript
// No PMS selection in our UI
// Instead: "Connect your PMS via Sikka"
<Button onClick={redirectToSikkaMarketplace}>
  Connect via Sikka Marketplace
</Button>

// Redirects to:
https://marketplace.sikka.com/apps/parlae/authorize
// Clinic selects their PMS there (Dentrix, Eaglesoft, etc.)
// Sikka handles the connection
// Sikka sends webhook to our backend
```

**Option B: Manual Entry (For testing)**
```typescript
// Admin/setup only - not for end users
<Form>
  <Input label="Sikka Office ID" name="officeId" />
  <Input label="Sikka Secret Key" name="secretKey" type="password" />
  <Button>Connect to Sikka</Button>
</Form>
```

---

## Correct Architecture

### System-Level Credentials (Shared)
```bash
# In environment/.env
SIKKA_APP_ID=b0cac8c638d52c92f9c0312159fc4518
SIKKA_APP_KEY=7beec2a9e62bd692eab2e0840b8bb2db
```

### Practice-Level Credentials (Per-Account)
```
AWS Secrets Manager:
parlae/pms/sikka/account_abc123 → {
  "officeId": "D36225",
  "secretKey": "STc3k...",
  "requestKey": "70a2c...",
  "refreshKey": "yyyy...",
  "tokenExpiry": "2026-02-11T04:00:28Z",
  "practiceName": "Happy Dental",
  "pmsType": "Dentrix"  ← The ACTUAL PMS they use
}
```

### Database
```typescript
{
  accountId: "account_abc123",
  provider: "SIKKA",  // The middleware
  secretArn: "arn:aws:secretsmanager:...:parlae/pms/sikka/account_abc123",
  status: "ACTIVE",
  metadata: {
    practiceName: "Happy Dental",
    actualPmsType: "Dentrix"  // What they actually use
  }
}
```

---

## Required Fixes

### 1. Add Sikka Webhook Endpoint
```typescript
POST /api/sikka/webhook/authorize
// Receives: { office_id, secret_key, practice_name }
// Does:
// 1. Create AWS secret
// 2. Generate tokens
// 3. Save integration record
```

### 2. Update PMS Service to Use Secrets Manager
```typescript
async getPracticeCredentials(accountId: string) {
  const integration = await prisma.pmsIntegration.findUnique({
    where: { accountId }
  });
  
  // Get from AWS Secrets Manager
  const secret = await secretsManager.getSecretValue({
    SecretId: integration.secretArn
  });
  
  return JSON.parse(secret.SecretString);
}
```

### 3. Add Missing Patient Vapi Tools
- createPatient
- updatePatient
- searchPatients (separate from getPatientInfo)
- cancelAppointment

### 4. Add HIPAA Audit Logging
Every patient data access logged to `pms_audit_logs`

---

## Next Steps (In Order)

1. **Add Terraform secrets configuration** ✅ I'll do this now
2. **Add Sikka webhook endpoint** for practice authorization
3. **Update PMS service** to use AWS Secrets Manager
4. **Add patient management tools** to Vapi
5. **Add HIPAA audit logging**
6. **Test with real Sikka credentials**

Let me start with these fixes now...
