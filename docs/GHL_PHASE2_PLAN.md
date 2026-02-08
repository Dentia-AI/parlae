# GHL Voice Agent Integration - Phase 2 Plan

## 🎯 Phase 2: Voice Agent Configuration

**Goal:** Enable users to configure and deploy AI voice agents with voices, phone numbers, and knowledge bases.

**Duration:** Estimated 2-3 hours of development

---

## 📊 Architecture Overview

```
Phase 1 (✅ Complete)
└── Sub-Account Created in GHL

Phase 2 (Building Now)
├── Step 2: Voice Selection
│   ├── Fetch available voices from GHL
│   ├── Display voice cards with audio previews
│   └── User selects preferred voice
│
├── Step 3: Phone Number Selection  
│   ├── Fetch available phone numbers from GHL
│   ├── Filter by area code/location
│   └── User selects or purchases phone number
│
├── Step 4: Knowledge Base Setup
│   ├── Upload PDF/DOCX files
│   ├── Scrape content from URL
│   ├── Manual text entry
│   └── Process and store knowledge base
│
└── Step 5: Review & Deploy
    ├── Display configuration summary
    ├── Create voice agent in GHL
    ├── Assign phone number
    ├── Upload knowledge base to GHL
    ├── Configure workflows (preset)
    └── Deploy agent
```

---

## 🔧 Components to Build

### 1. Voice Selection (Step 2)

#### Backend
- **Service:** `GhlVoiceService`
  - `getAvailableVoices()` - Fetch from GHL API
  - `getVoicePreview(voiceId)` - Get audio sample URL
  
- **Controller:** `GhlVoiceController`
  - `GET /ghl/voices` - List available voices
  - `GET /ghl/voices/:id/preview` - Get voice preview

#### Frontend
- **Page:** `/home/ai-agent/setup/voice`
- **Component:** `VoiceSelectionForm`
  - Display voice cards (male/female/accent)
  - Audio preview player
  - Voice description
  - Select button

#### API Endpoints Needed
```
GET https://services.leadconnectorhq.com/voice-agents/voices
```

---

### 2. Phone Number Selection (Step 3)

#### Backend
- **Service:** `GhlPhoneService`
  - `getAvailableNumbers(areaCode?, state?)` - Search available numbers
  - `purchaseNumber(phoneNumber)` - Buy number (if needed)
  - `assignNumberToAgent(agentId, phoneNumber)` - Assign to agent

- **Controller:** `GhlPhoneController`
  - `GET /ghl/phone-numbers` - List available numbers
  - `GET /ghl/phone-numbers/search` - Search by area code
  - `POST /ghl/phone-numbers/:number/purchase` - Purchase number

#### Frontend
- **Page:** `/home/ai-agent/setup/phone`
- **Component:** `PhoneNumberSelection`
  - Search by area code
  - Filter by state
  - Display available numbers
  - Show pricing (if applicable)

#### API Endpoints Needed
```
GET https://services.leadconnectorhq.com/phone-numbers/available
POST https://services.leadconnectorhq.com/phone-numbers/purchase
```

---

### 3. Voice Agent Creation Service

#### Backend
- **Service:** `GhlVoiceAgentService`
  - `createVoiceAgent(subAccountId, config)` - Create agent in GHL
  - `getVoiceAgent(id)` - Get agent details
  - `updateVoiceAgent(id, config)` - Update configuration
  - `deployAgent(id)` - Activate agent
  - `pauseAgent(id)` - Pause agent
  - `deleteAgent(id)` - Remove agent

- **Controller:** `GhlVoiceAgentController`
  - `POST /ghl/voice-agents` - Create agent
  - `GET /ghl/voice-agents/:id` - Get agent
  - `PATCH /ghl/voice-agents/:id` - Update agent
  - `POST /ghl/voice-agents/:id/deploy` - Deploy agent
  - `POST /ghl/voice-agents/:id/pause` - Pause agent
  - `DELETE /ghl/voice-agents/:id` - Delete agent

#### Agent Configuration (Preset)
```typescript
{
  name: "Customer Service Agent",
  voiceId: "selected-voice-id",
  phoneNumber: "selected-phone",
  language: "en-US",
  
  // Preset Prompt
  prompt: `You are a friendly customer service agent for {businessName}. 
  Your job is to answer questions, schedule appointments, and capture leads.
  Be professional, helpful, and concise.`,
  
  // Preset Workflows
  workflows: {
    appointmentBooking: true,
    leadCapture: true,
    informationRetrieval: true
  },
  
  // Post-call Actions (Preset)
  postCallActions: {
    sendSMS: true,
    sendEmail: true,
    updateCRM: true,
    webhookNotification: true
  },
  
  // Business Hours (Default)
  businessHours: {
    timezone: "from sub-account",
    schedule: {
      monday: { open: "09:00", close: "17:00" },
      tuesday: { open: "09:00", close: "17:00" },
      wednesday: { open: "09:00", close: "17:00" },
      thursday: { open: "09:00", close: "17:00" },
      friday: { open: "09:00", close: "17:00" },
      saturday: { closed: true },
      sunday: { closed: true }
    }
  }
}
```

#### GHL API Endpoint
```
POST https://services.leadconnectorhq.com/conversations/conversations/ai-agents
```

---

### 4. Knowledge Base Management

#### Backend
- **Service:** `KnowledgeBaseService`
  - `uploadFile(voiceAgentId, file)` - Upload PDF/DOCX
  - `addFromUrl(voiceAgentId, url)` - Scrape URL
  - `addText(voiceAgentId, title, content)` - Manual entry
  - `processKnowledge(knowledgeId)` - Process and vectorize
  - `uploadToGhl(voiceAgentId)` - Upload to GHL agent

- **Controller:** `KnowledgeBaseController`
  - `POST /ghl/knowledge-base` - Upload file
  - `POST /ghl/knowledge-base/url` - Add from URL
  - `POST /ghl/knowledge-base/text` - Add manual text
  - `GET /ghl/knowledge-base/:voiceAgentId` - List all
  - `DELETE /ghl/knowledge-base/:id` - Remove entry

#### Frontend
- **Page:** `/home/ai-agent/setup/knowledge`
- **Component:** `KnowledgeBaseUpload`
  - File upload dropzone (PDF, DOCX, TXT)
  - URL input for web scraping
  - Rich text editor for manual entry
  - List of uploaded knowledge

#### File Processing
- Extract text from PDF using `pdf-parse`
- Extract from DOCX using `mammoth`
- Scrape URLs using `cheerio` or `puppeteer`
- Store in `knowledge_base` table
- Upload to GHL agent

---

### 5. Review & Deploy (Step 5)

#### Frontend
- **Page:** `/home/ai-agent/setup/review`
- **Component:** `DeploymentReview`
  - Summary of all configuration
  - Test call button
  - Deploy button
  - Configuration preview

#### Deployment Flow
```typescript
1. Create voice agent in GHL
2. Assign phone number
3. Upload knowledge base
4. Configure workflows (preset)
5. Set up webhooks for post-call actions
6. Activate agent
7. Update status in database
8. Show success message with agent details
```

---

## 🗄️ Database Usage

We already have the tables from Phase 1:

### `voice_agents` Table
```sql
- id (uuid, PK)
- sub_account_id (FK → ghl_sub_accounts)
- name
- ghl_agent_id (from GHL)
- voice_id
- voice_name
- phone_number
- language
- prompt
- workflows (JSON)
- post_call_actions (JSON)
- status (draft, active, paused)
- is_deployed (boolean)
```

### `knowledge_base` Table  
```sql
- id (uuid, PK)
- voice_agent_id (FK → voice_agents)
- title
- content (TEXT)
- source (upload, url, text)
- file_url
- ghl_resource_id
- is_processed (boolean)
```

### `call_logs` Table (Phase 3)
```sql
- For storing call history
- Will be populated by GHL webhooks
```

---

## 📦 NPM Packages Needed

```bash
# Backend
pnpm add pdf-parse mammoth cheerio @types/pdf-parse @types/mammoth

# Frontend
pnpm add react-dropzone @tanstack/react-query
```

---

## 🔗 GHL API Endpoints Reference

### Voice Agents API
```
POST   /conversations/conversations/ai-agents
GET    /conversations/conversations/ai-agents/:id
PATCH  /conversations/conversations/ai-agents/:id
DELETE /conversations/conversations/ai-agents/:id
POST   /conversations/conversations/ai-agents/:id/activate
POST   /conversations/conversations/ai-agents/:id/pause
```

### Phone Numbers API
```
GET  /phone-numbers/available
POST /phone-numbers/purchase
POST /phone-numbers/:number/assign
```

### Knowledge Base API
```
POST /ai-agents/:id/knowledge-base
GET  /ai-agents/:id/knowledge-base
DELETE /ai-agents/:id/knowledge-base/:resourceId
```

### Voices API
```
GET /voices/available
GET /voices/:id/preview
```

---

## 🧪 Testing Strategy

### Unit Tests
- Service methods for voice agent creation
- Knowledge base file parsing
- Validation logic

### Integration Tests
- Full flow from voice selection to deployment
- GHL API integration
- File upload and processing

### E2E Tests
- Complete wizard flow
- Test call functionality
- Agent activation

---

## 🚀 Deployment Checklist

- [ ] Voice selection UI
- [ ] Phone number selection UI
- [ ] Knowledge base upload
- [ ] Voice agent creation service
- [ ] GHL API integration
- [ ] Preset workflows configuration
- [ ] Webhook setup for post-call actions
- [ ] Review & deploy page
- [ ] Testing & validation

---

## 📈 Success Metrics

✅ User can select a voice  
✅ User can select a phone number  
✅ User can upload knowledge base  
✅ Voice agent creates successfully in GHL  
✅ Agent can make/receive test calls  
✅ Post-call actions trigger correctly  
✅ Call logs are captured  

---

## ⏭️ Phase 3 Preview

After Phase 2, we'll build:
- Call logs dashboard
- Analytics & reporting
- Advanced workflow customization
- Custom prompts editor
- Business hours configuration
- Multi-agent management

---

**Let's start building Phase 2!** 🚀
