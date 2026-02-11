# Vapi Tool Types & Facility Identification Guide

## Vapi Tool Types Explained

### 1. **handoff** Tool (Multi-Agent Transfer)

**Purpose:** Transfer between different AI assistants within a Squad (not to humans)

**Use Case:**
```
Receptionist → Billing Specialist → Appointment Scheduler
     |                |                      |
  General info    Payment help         Booking
```

**When to Use:**
- ✅ Complex workflows requiring specialized AI agents
- ✅ Escalating to an AI with different knowledge/permissions
- ✅ Multi-step processes handled by different assistants

**When NOT to Use:**
- ❌ Transferring to a human (use `transferCall` instead)
- ❌ Simple single-assistant workflows

**Example:**
```javascript
{
  type: 'handoff',
  destinations: [
    {
      type: 'assistant',
      assistantId: 'billing-specialist-123',
      message: 'Let me connect you to our billing specialist...'
    },
    {
      type: 'assistant',
      assistantId: 'appointment-scheduler-456',
      message: 'Transferring you to our scheduler...'
    }
  ]
}
```

**For Your Use Case:**
You probably **DON'T need handoff** right now. Your single receptionist AI handles:
- Patient search
- Appointment booking
- Balance inquiries
- Transfer to human

---

### 2. **dtmf** Tool (Keypad Input)

**Purpose:** Collect phone keypad input (Press 1 for X, Press 2 for Y)

**Use Case:**
```
"Press 1 for appointments"
"Press 2 for billing"
"Press # when done"
"Enter your 4-digit PIN"
```

**When to Use:**
- ✅ Collecting structured input (PINs, confirmation codes)
- ✅ Traditional IVR-style menus
- ✅ Authentication via keypad
- ✅ Payment confirmation

**When NOT to Use:**
- ❌ Natural language is better (AI can understand speech)
- ❌ Complex information gathering (voice is easier)

**Example:**
```javascript
{
  type: 'dtmf',
  function: {
    name: 'collectPin',
    description: 'Collect 4-digit PIN from keypad',
    parameters: {
      numDigits: 4,
      timeout: 10
    }
  },
  messages: [
    {
      type: 'request-start',
      content: 'Please enter your 4-digit PIN followed by the pound key'
    }
  ]
}
```

**For Your Use Case:**
You **might want dtmf** for:
- Patient verification (date of birth via keypad)
- Payment confirmation codes
- Prescription refill numbers

---

### 3. **sipRequest** Tool (Advanced SIP Operations)

**Purpose:** Low-level SIP telephony commands

**Use Case:**
- Custom call routing logic
- Advanced telephony integrations
- SIP header manipulation
- Custom transfer logic

**When to Use:**
- ✅ Very advanced telephony requirements
- ✅ Custom SIP trunk integrations
- ✅ Enterprise-level call control

**For Your Use Case:**
You **DON'T need this**. Use `transferCall` instead.

---

## Facility/Clinic Identification Problem

### Current Issue

**Problem:** How do we know which dental clinic the call is for?

When a patient calls:
1. Call comes to Vapi phone number (e.g., +1-555-CLINIC-1)
2. Vapi triggers assistant
3. Assistant calls our API: `/api/pms/patients/search`
4. **How do we know which Sikka clinic to query?**

### Solution Architecture

#### 1. Store Phone-to-Clinic Mapping

Add to your Prisma schema:

```prisma
model VapiPhoneNumber {
  id            String   @id @default(uuid())
  accountId     String   @map("account_id")
  vapiPhoneId   String   @unique @map("vapi_phone_id")  // From Vapi API
  phoneNumber   String   @unique @map("phone_number")   // E.g., +15551234567
  assistantId   String?  @map("assistant_id")           // Vapi assistant ID
  
  // Link to PMS
  pmsIntegrationId String? @map("pms_integration_id")
  
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  
  account        Account         @relation(fields: [accountId], references: [id])
  pmsIntegration PmsIntegration? @relation(fields: [pmsIntegrationId], references: [id])
  
  @@map("vapi_phone_numbers")
}

// Update PmsIntegration
model PmsIntegration {
  // ... existing fields ...
  
  phoneNumbers VapiPhoneNumber[]  // One clinic can have multiple phone numbers
}
```

#### 2. Identify Clinic from Call Context

**Vapi sends phone number in webhook:**

```json
{
  "call": {
    "id": "call-123",
    "phoneNumberId": "phone-abc-456",
    "phoneNumber": "+15551234567",
    "customer": { ... }
  },
  "tool": {
    "name": "searchPatients"
  },
  "parameters": {
    "query": "John Smith"
  }
}
```

#### 3. Updated API Route Flow

```typescript
// apps/frontend/apps/web/app/api/pms/_lib/pms-utils.ts

export async function getAccountAndPmsFromCall(callData: any): Promise<{
  accountId: string;
  pmsIntegrationId: string;
  pmsIntegration: PmsIntegration;
}> {
  // Extract phone number from call
  const phoneNumber = callData.call?.phoneNumber;
  const vapiPhoneId = callData.call?.phoneNumberId;
  
  if (!phoneNumber && !vapiPhoneId) {
    throw new Error('No phone number in call context');
  }
  
  // Look up which clinic this phone belongs to
  const vapiPhone = await prisma.vapiPhoneNumber.findFirst({
    where: {
      OR: [
        { phoneNumber },
        { vapiPhoneId }
      ]
    },
    include: {
      account: true,
      pmsIntegration: true
    }
  });
  
  if (!vapiPhone || !vapiPhone.pmsIntegration) {
    throw new Error('No PMS integration found for this phone number');
  }
  
  return {
    accountId: vapiPhone.accountId,
    pmsIntegrationId: vapiPhone.pmsIntegration.id,
    pmsIntegration: vapiPhone.pmsIntegration
  };
}
```

#### 4. Use in API Routes

```typescript
// apps/frontend/apps/web/app/api/pms/patients/route.ts

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return unauthorizedResponse();
    }
    
    // 2. Get clinic from phone number
    const { accountId, pmsIntegrationId, pmsIntegration } = 
      await getAccountAndPmsFromCall(auth.data);
    
    // 3. Get PMS service for THIS specific clinic
    const pmsService = await getPmsService(accountId, pmsIntegrationId);
    
    // 4. Make Sikka API call with THIS clinic's credentials
    const patients = await pmsService.searchPatients(body.query);
    
    // 5. Log access for THIS clinic
    await logPmsAccess({
      pmsIntegrationId,
      operation: 'SEARCH_PATIENTS',
      // ...
    });
    
    return Response.json({ success: true, data: patients });
  } catch (error) {
    // ...
  }
}
```

---

## Implementation Steps

### Step 1: Update Database Schema

```typescript
// packages/prisma/schema.prisma

// Add VapiPhoneNumber model (see above)

// Update PmsIntegration to include relation
model PmsIntegration {
  id                String   @id @default(uuid())
  accountId         String   @map("account_id")
  provider          PmsProvider
  // ... existing fields ...
  
  phoneNumbers      VapiPhoneNumber[]  // Add this
  
  @@map("pms_integrations")
}
```

Run migration:
```bash
cd packages/prisma
npx prisma migrate dev --name add_vapi_phone_numbers
npx prisma generate
```

### Step 2: Create Phone Number Registration

```typescript
// apps/frontend/apps/web/app/api/vapi/phone-numbers/route.ts

export async function POST(request: Request) {
  const { vapiPhoneId, phoneNumber, accountId, pmsIntegrationId } = await request.json();
  
  const vapiPhone = await prisma.vapiPhoneNumber.create({
    data: {
      vapiPhoneId,
      phoneNumber,
      accountId,
      pmsIntegrationId
    }
  });
  
  return Response.json({ success: true, data: vapiPhone });
}
```

### Step 3: Seed Test Data

```typescript
// packages/prisma/seed.ts

// Add test phone-to-clinic mapping
await prisma.vapiPhoneNumber.create({
  data: {
    vapiPhoneId: 'phone-id-from-vapi',
    phoneNumber: '+14156635316',  // Your test number
    accountId: 'test-account-id',
    pmsIntegrationId: 'test-pms-integration-id',
    assistantId: '644878a7-429b-4ed1-b850-6a9aefb8176d'
  }
});
```

### Step 4: Update API Utility

Create the helper function shown above in `pms-utils.ts`

### Step 5: Update All PMS API Routes

Replace the manual `accountId` extraction with:

```typescript
const { accountId, pmsIntegrationId } = await getAccountAndPmsFromCall(auth.data);
const pmsService = await getPmsService(accountId, pmsIntegrationId);
```

---

## Testing Multi-Clinic Setup

### Scenario: Two Dental Clinics

**Clinic A (Dr. Smith):**
- Phone: +1-555-111-1111
- Sikka Customer ID: CLINIC_A_123
- Vapi Assistant: dental-receptionist-smith

**Clinic B (Dr. Jones):**
- Phone: +1-555-222-2222
- Sikka Customer ID: CLINIC_B_456
- Vapi Assistant: dental-receptionist-jones

**Database Setup:**
```sql
-- Clinic A
INSERT INTO vapi_phone_numbers (
  vapi_phone_id, phone_number, account_id, pms_integration_id
) VALUES (
  'vapi-phone-clinic-a',
  '+15551111111',
  'account-clinic-a',
  'pms-integration-clinic-a'
);

-- Clinic B
INSERT INTO vapi_phone_numbers (
  vapi_phone_id, phone_number, account_id, pms_integration_id
) VALUES (
  'vapi-phone-clinic-b',
  '+15552222222',
  'account-clinic-b',
  'pms-integration-clinic-b'
);
```

**When Patient Calls:**
1. Patient dials +1-555-111-1111 (Clinic A)
2. Vapi webhook includes `phoneNumber: "+15551111111"`
3. Your API looks up → finds `pms-integration-clinic-a`
4. Makes Sikka API call with Clinic A's credentials
5. Returns Clinic A's patient data

---

## Recommendation

### DO Implement:
1. ✅ **VapiPhoneNumber table** - Essential for multi-clinic support
2. ✅ **Phone-to-clinic mapping** - Core functionality
3. ✅ **transferCall tool** - Already have this for human handoff

### MAYBE Add Later:
1. 🤔 **dtmf tool** - If you need PIN/verification codes
2. 🤔 **handoff tool** - If workflows become complex (billing specialist, etc.)

### DON'T Need:
1. ❌ **sipRequest tool** - Too low-level for your use case

---

## Next Steps

1. Create migration for `VapiPhoneNumber` table
2. Seed test data linking your test phone to a clinic
3. Update `getAccountAndPmsFromCall` utility
4. Update all PMS API routes to use it
5. Test with your current phone number

Want me to implement the phone-to-clinic mapping system?
