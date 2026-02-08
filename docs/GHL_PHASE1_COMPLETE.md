# GHL Voice Agent Integration - Phase 1 Complete ✅

## Overview

Phase 1 of the GHL Voice Agent integration is complete! This phase establishes the foundation for creating and managing GHL sub-accounts for users.

**Completion Date**: January 28, 2026

---

## 🎯 What Was Built

### 1. Database Schema ✅

**New Tables:**
- `ghl_sub_accounts` - Stores GHL sub-account information
- `voice_agents` - Stores voice agent configurations (ready for Phase 2)
- `knowledge_base` - Stores knowledge base content (ready for Phase 2)
- `call_logs` - Stores call history and transcripts (ready for Phase 2)

**New Enums:**
- `GhlSubAccountStatus` - pending, active, suspended, deleted
- `VoiceAgentStatus` - draft, active, paused, archived  
- `KnowledgeBaseSource` - upload, url, text

**Migration File:**
```
dentia/packages/prisma/migrations/20260128000000_add_ghl_sub_accounts/migration.sql
```

### 2. Backend API ✅

**Location:** `dentia/apps/backend/src/ghl/`

**Services:**
- `GhlSubAccountService` - Handles sub-account creation and management
  - Create sub-account in GHL via API
  - Store sub-account in database
  - Sync data with GHL
  - Update setup progress
  - Suspend/reactivate sub-accounts

**Controllers:**
- `GhlSubAccountController` - REST API endpoints
  - `POST /ghl/sub-accounts` - Create new sub-account
  - `GET /ghl/sub-accounts/my` - Get current user's sub-account
  - `GET /ghl/sub-accounts/:id` - Get sub-account by ID
  - `PATCH /ghl/sub-accounts/:id` - Update sub-account
  - `PATCH /ghl/sub-accounts/:id/setup-step` - Update setup progress
  - `POST /ghl/sub-accounts/:id/suspend` - Suspend sub-account
  - `POST /ghl/sub-accounts/:id/reactivate` - Reactivate sub-account
  - `DELETE /ghl/sub-accounts/:id` - Delete sub-account (soft delete)
  - `POST /ghl/sub-accounts/:id/sync` - Sync with GHL
  - `GET /ghl/sub-accounts` - List all user's sub-accounts

**Module:**
- `GhlModule` - Registered in main `AppModule`

### 3. Frontend Components ✅

**Location:** `dentia/apps/frontend/apps/web/app/home/(user)/ai-agent/setup/`

**Pages:**
- `/home/ai-agent/setup` - Main setup page with progress indicators
- `/home/ai-agent/setup/voice` - Placeholder for Phase 2

**Components:**
- `BusinessDetailsForm` - Form to collect business information
  - Business name (required)
  - Industry selector
  - Email, phone, website
  - Address (street, city, state, ZIP)
  - Timezone selector
  - Validation and error handling

**Hooks:**
Location: `dentia/apps/frontend/packages/shared/src/ghl/hooks/use-sub-account.ts`

- `useSubAccount()` - Fetch current user's sub-account
- `useCreateSubAccount()` - Create new sub-account
- `useUpdateSubAccount()` - Update sub-account
- `useUpdateSetupStep()` - Update setup progress

---

## 🔧 Technical Details

### API Integration

**GHL v2 API Endpoints Used:**
- `POST https://services.leadconnectorhq.com/locations` - Create sub-account
- `GET https://services.leadconnectorhq.com/locations/:id` - Get sub-account details

**Authentication:**
- Uses Agency-level private integration key from `config.sh`
- Same key used for all sub-accounts (Agency model)

### Data Flow

```
User fills form → Frontend validates
                ↓
              useCreateSubAccount hook
                ↓
       POST /ghl/sub-accounts (Backend)
                ↓
    GhlSubAccountService.createSubAccount()
                ↓
        Create location in GHL API
                ↓
        Store in database (ghl_sub_accounts)
                ↓
         Return sub-account data
                ↓
        Redirect to next step
```

### Setup Progress Tracking

The system tracks user progress through the setup wizard:

- `setupStep` (integer) - Current step (0-5)
- `setupCompleted` (boolean) - Whether setup is complete
- Step 1: Business Details ✅
- Step 2: Voice Selection (Phase 2)
- Step 3: Phone Number (Phase 2)
- Step 4: Knowledge Base (Phase 2)
- Step 5: Review & Deploy (Phase 2)

---

## 🧪 Testing Phase 1

### Prerequisites

1. **GHL Configuration** (already set in `config.sh`):
   ```bash
   GHL_API_KEY=pit-5849de7b-b4dd-4dcf-92ec-048b01640027
   GHL_LOCATION_ID=dIKzdXsNArISLRIrOnHI
   ```

2. **Development environment running**:
   ```bash
   cd dentia
   ./dev.sh
   ```

### Test Steps

#### 1. Navigate to AI Agent Setup

Open your browser:
```
http://localhost:3000/home/ai-agent/setup
```

#### 2. Fill Out Business Details Form

**Required Field:**
- Business Name: "Test Dental Clinic"

**Optional Fields:**
- Industry: Select "Dental"
- Email: test@example.com
- Phone: (555) 123-4567
- Website: https://test.com
- Address: 123 Main St
- City: New York
- State: NY
- ZIP: 10001
- Timezone: Eastern Time (ET)

#### 3. Submit Form

Click "Continue to Voice Selection"

**Expected Results:**
- ✅ Loading indicator appears
- ✅ Success message: "Business details saved successfully!"
- ✅ Redirects to `/home/ai-agent/setup/voice`

#### 4. Verify in Database

```bash
psql postgresql://dentia:dentia@localhost:5433/dentia

SELECT * FROM ghl_sub_accounts;
```

**Expected:**
- New row with your business details
- `status` = 'active'
- `setup_step` = 1
- `setup_completed` = false
- `ghl_location_id` populated

#### 5. Verify in GHL Dashboard

1. Log in to GHL: https://app.gohighlevel.com
2. Check **Locations** or **Sub-Accounts**
3. Find "Test Dental Clinic"
4. Verify all details match

#### 6. Test API Endpoints

**Get my sub-account:**
```bash
curl http://localhost:4001/ghl/sub-accounts/my \
  -H "Cookie: your-auth-cookie" \
  --include
```

**Update sub-account:**
```bash
curl -X PATCH http://localhost:4001/ghl/sub-accounts/:id \
  -H "Cookie: your-auth-cookie" \
  -H "Content-Type: application/json" \
  -d '{"businessName": "Updated Dental Clinic"}'
```

---

## 📁 Files Created/Modified

### Backend Files
```
dentia/apps/backend/src/
├── ghl/
│   ├── ghl.module.ts                    (NEW)
│   ├── controllers/
│   │   └── ghl-sub-account.controller.ts (NEW)
│   └── services/
│       └── ghl-sub-account.service.ts     (NEW)
└── app.module.ts                         (MODIFIED - added GhlModule)
```

### Frontend Files
```
dentia/apps/frontend/
├── packages/shared/src/
│   ├── ghl/hooks/
│   │   └── use-sub-account.ts           (NEW)
│   └── gohighlevel/
│       └── index.ts                     (MODIFIED - exported hooks)
└── apps/web/app/home/(user)/ai-agent/setup/
    ├── page.tsx                         (NEW)
    ├── business-details-form.tsx        (NEW)
    └── voice/
        └── page.tsx                     (NEW - placeholder)
```

### Database Files
```
dentia/packages/prisma/
├── schema.prisma                        (MODIFIED - added models)
└── migrations/
    └── 20260128000000_add_ghl_sub_accounts/
        └── migration.sql                (NEW)
```

---

## 🚀 Next Steps: Phase 2 & 3

### Phase 2: Voice Agent Configuration

**To Build:**
1. Voice selection interface
   - Fetch available voices from GHL API
   - Display voice previews with audio samples
   - Allow user to select voice

2. Phone number selection
   - Fetch available phone numbers from GHL
   - Display by area code
   - Allow user to select or purchase number

3. Voice agent creation service
   - Create voice agent in GHL
   - Configure agent with selected voice and phone
   - Store agent in `voice_agents` table

4. Knowledge base upload
   - File upload (PDF, DOCX)
   - URL scraping
   - Manual text entry
   - Store in `knowledge_base` table

### Phase 3: Advanced Configuration

**To Build:**
1. Workflow configuration
   - Appointment booking setup
   - Lead capture forms
   - Call routing rules
   - Voicemail handling

2. Post-call actions
   - SMS follow-up templates
   - Email notifications
   - CRM updates
   - Custom API webhooks

3. In-call actions
   - Call transfer rules
   - IVR menus
   - Custom field collection

4. Review & deployment
   - Configuration summary
   - Test call interface
   - Deploy to production

5. Call logs & analytics
   - Display call history
   - Show transcripts
   - Analytics dashboard

---

## 🔐 Security Notes

1. **Authentication**: All endpoints require authentication via AuthGuard
2. **Authorization**: Users can only access their own sub-accounts
3. **API Key**: Stored in environment variables, never exposed to client
4. **Soft Delete**: Sub-accounts are soft-deleted (status = 'deleted')
5. **Data Validation**: Frontend and backend validation on all inputs

---

## 📊 Database Schema Overview

```sql
ghl_sub_accounts
├── id (UUID, PK)
├── user_id (FK → users)
├── account_id (FK → accounts, optional)
├── ghl_location_id (unique)
├── business_name
├── business_email
├── business_phone
├── business_address
├── business_website
├── timezone
├── industry
├── status (enum)
├── setup_completed (boolean)
├── setup_step (integer)
└── metadata (JSON)

voice_agents (Phase 2)
├── id (UUID, PK)
├── sub_account_id (FK → ghl_sub_accounts)
├── voice_id
├── phone_number
├── prompt
├── workflows (JSON)
└── ... (more fields)

knowledge_base (Phase 2)
├── id (UUID, PK)
├── voice_agent_id (FK → voice_agents)
├── title
├── content
├── source (enum)
└── ... (more fields)

call_logs (Phase 3)
├── id (UUID, PK)
├── voice_agent_id (FK → voice_agents)
├── transcript
├── recording_url
└── ... (more fields)
```

---

## 🎉 Phase 1 Complete!

✅ Database schema created  
✅ Backend API implemented  
✅ Frontend forms built  
✅ Sub-account creation working  
✅ GHL v2 API integration tested  

**Ready for Phase 2: Voice Agent Configuration**

---

## 📞 Support & Documentation

### Related Documentation
- `/dentia/docs/GOHIGHLEVEL_INTEGRATION.md` - GHL integration overview
- `/dentia/docs/GHL_V2_API_MIGRATION_COMPLETE.md` - v2 API migration
- `/scripts/test-ghl-api.sh` - API testing script
- `/config.sh` - GHL configuration

### API Documentation
- GHL API v2: https://highlevel.stoplight.io/
- GHL Support: https://help.gohighlevel.com/

---

**Status**: ✅ Phase 1 Complete  
**Next**: Phase 2 - Voice Agent Configuration  
**Last Updated**: January 28, 2026


