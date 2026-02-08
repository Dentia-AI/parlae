# Vapi Integration - Quick Reference

## Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│ USER LOGS IN                                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Browser                                                    │
│    ↓                                                        │
│  POST /auth/login                                           │
│    email: user@example.com                                  │
│    password: ****                                           │
│    ↓                                                        │
│  Supabase Auth                                              │
│    ↓                                                        │
│  Session Cookie Set ✅                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ USER MAKES API CALL (Authenticated)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Browser → POST /api/vapi/phone-numbers                    │
│            Cookie: session=xyz (automatic)                  │
│    ↓                                                        │
│  API Route:                                                 │
│    1. getUser() from cookie → user                          │
│    2. Get user's account_id                                 │
│    3. Create phone for that account                         │
│    4. Return success                                        │
│                                                             │
│  ✅ No API keys in request!                                │
│  ✅ Automatic account isolation!                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Setup Flow

```
ADMIN (One-Time Setup)
┌─────────────────────────────────────────┐
│ 1. Run Prisma Migration                 │
│    npx prisma migrate dev               │
│    ↓                                    │
│ 2. Preset Templates Created             │
│    ✅ Dental Clinic Squad               │
│    ✅ Sales Pipeline Squad              │
│    ✅ Support Triage Squad              │
│    ✅ Customer Support Assistant        │
│    ✅ Sales Agent Assistant             │
└─────────────────────────────────────────┘
                 │
                 │ Templates ready
                 ↓
┌─────────────────────────────────────────────────────────────┐
│ ACCOUNT SETUP (Per Account)                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Step 1: User logs in                                       │
│    └→ Supabase auth creates session                        │
│                                                             │
│  Step 2: List available templates                           │
│    GET /api/vapi/templates                                  │
│    └→ Returns: Dental, Sales, Support squads               │
│                                                             │
│  Step 3: User selects "Dental Clinic"                      │
│    POST /api/vapi/phone-numbers                             │
│    body: {                                                  │
│      squadTemplateId: "squad_dental_clinic",               │
│      areaCode: "415"                                        │
│    }                                                        │
│    ↓                                                        │
│    API automatically:                                       │
│    1. Gets user's account_id ✅                            │
│    2. Purchases Twilio number ✅                           │
│    3. Links to preset squad ✅                             │
│    4. Saves to database ✅                                 │
│    5. Returns phone number ✅                              │
│                                                             │
│  Result: +1-415-555-1234 → Dental Clinic Squad             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                 │
                 │ Ready to use
                 ↓
┌─────────────────────────────────────────────────────────────┐
│ CUSTOMER CALLS: +1-415-555-1234                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Vapi routes to: Dental Clinic Squad (preset)              │
│    ↓                                                        │
│  Triage Assistant answers:                                  │
│    "Thank you for calling! How can I help?"                │
│    ↓                                                        │
│  Customer: "I have severe tooth pain"                      │
│    ↓                                                        │
│  Triage: Detects emergency keywords                        │
│    ↓                                                        │
│  [TRANSFER] → Emergency Assistant                           │
│    "Let's get you in today. What's your name?"             │
│    ↓                                                        │
│  Calls bookAppointment tool                                 │
│    ↓                                                        │
│  Webhook: /api/vapi/webhook                                 │
│    Saves to vapi_call_logs                                  │
│    Syncs to GHL CRM                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints Cheat Sheet

### 1. List Templates

```bash
GET /api/vapi/templates

# No body needed - authentication via session cookie

Response:
{
  "success": true,
  "squads": [
    {
      "id": "squad_dental_clinic",
      "display_name": "Dental Clinic (Triage + Emergency + Scheduler)",
      "squad_type": "dental_clinic"
    }
  ],
  "assistants": [...]
}
```

### 2. Assign Phone Number

```bash
POST /api/vapi/phone-numbers
Content-Type: application/json

{
  "squadTemplateId": "squad_dental_clinic",
  "areaCode": "415",
  "friendlyName": "Main Office"
}

Response:
{
  "success": true,
  "phoneNumber": {
    "phoneNumber": "+14155551234",
    "status": "active",
    "templateName": "Dental Clinic"
  }
}
```

### 3. List Account's Phone Numbers

```bash
GET /api/vapi/phone-numbers

Response:
{
  "success": true,
  "phoneNumbers": [
    {
      "phone_number": "+14155551234",
      "friendly_name": "Main Office",
      "status": "active",
      "squad_template": {
        "display_name": "Dental Clinic"
      },
      "total_calls": 45,
      "last_call_at": "2026-01-30T10:30:00Z"
    }
  ]
}
```

## Database Tables Quick Reference

### vapi_squad_templates (Preset, Shared)
```sql
id                | squad_dental_clinic
name              | dental-clinic
display_name      | Dental Clinic (Triage + Emergency + Scheduler)
squad_type        | dental_clinic
vapi_squad_id     | squad_xyz123 (from Vapi)
status            | active
```

### vapi_phone_numbers (Per Account)
```sql
id                      | phone_abc123
account_id              | acc_456 (your account)
phone_number            | +14155551234
squad_template_id       | squad_dental_clinic (links to template)
vapi_phone_id           | ph_xyz789 (from Vapi)
twilio_phone_sid        | PN123... (from Twilio)
status                  | active
total_calls             | 45
```

### vapi_call_logs (Per Call)
```sql
id                | call_789
account_id        | acc_456
phone_number_id   | phone_abc123
vapi_call_id      | call_xyz (from Vapi)
transcript        | "Hi, I need help with..."
analysis          | {"sentiment": "positive", "name": "John"}
duration_seconds  | 180
cost_cents        | 42
```

## Cost Comparison

### Old Architecture (❌ Inefficient)
```
100 Accounts × 1 Squad Each = 100 Squads in Vapi
100 Squads × 3 Assistants = 300 Assistants in Vapi

Cost Impact:
- More API calls to create/manage
- Slower setup time
- Hard to update all accounts
```

### New Architecture (✅ Efficient)
```
3 Preset Squads (shared by all) = 3 Squads in Vapi
3 Squads × 3 Assistants = 9 Assistants in Vapi

100 Accounts just link phone numbers to these 3 squads

Cost Impact:
- 97% fewer resources in Vapi
- Instant setup (< 5 seconds)
- Update once, affects everyone
```

## Common Use Cases

### Use Case 1: Single Office Dental Practice
```
Account: "Smile Dental"
Phone: +1-415-555-1234 → Dental Clinic Squad
Knowledge: Hours, services, insurance
Result: Triage, emergency, and scheduling all automated
```

### Use Case 2: Multi-Location Practice
```
Account: "Metro Dental Group"
Phone 1: +1-415-555-1234 → Dental Clinic Squad (SF office)
Phone 2: +1-408-555-5678 → Dental Clinic Squad (SJ office)
Phone 3: +1-415-555-9999 → Customer Support Assistant (billing)
Knowledge: Combined info for all locations
Result: Each location has AI answering, using same squad template
```

### Use Case 3: SaaS Company
```
Account: "Acme SaaS"
Phone 1: +1-212-555-1111 → Sales Pipeline Squad (inbound sales)
Phone 2: +1-212-555-2222 → Customer Support Assistant (support)
Knowledge: Product features, pricing, integrations
Result: Sales qualification and support automation
```

## Key Takeaways

✅ **Authentication**: Session-based, no API keys in frontend  
✅ **Templates**: Created once, shared by all accounts  
✅ **Phone Numbers**: Each account can have many  
✅ **Knowledge Base**: Account-specific, used by all templates  
✅ **Cost**: 97% reduction in Vapi resources  
✅ **Performance**: < 5 second setup time  
✅ **Security**: Account isolation built-in  
✅ **Flexibility**: Mix and match templates per phone number  

## Testing One-Liner

```bash
# Full test in one command (after migration)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-app.com/api/vapi/templates | jq '.squads[0].id' | \
  xargs -I {} curl -X POST https://your-app.com/api/vapi/phone-numbers \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"squadTemplateId": "{}", "areaCode": "415"}'
```

---

**Full Documentation**: See `/docs/VAPI_ARCHITECTURE.md`
