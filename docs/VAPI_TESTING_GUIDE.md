# Testing Vapi + Twilio Integration

Complete guide for testing single assistants, squads, knowledge bases, and tool calls.

## Prerequisites

Before starting, you need:

1. **Vapi Account** - [Sign up at vapi.ai](https://dashboard.vapi.ai/)
   - Private API Key (server-side)
   - Public API Key (client-side, optional)

2. **Twilio Account** - [Sign up at twilio.com](https://console.twilio.com/)
   - Account SID
   - Auth Token
   - Account with funds ($20+ recommended)

3. **ngrok** (for local testing) - [Download ngrok](https://ngrok.com/)
   - Needed for webhook testing locally

## Setup Guide

### Step 1: Set Environment Variables

```bash
# .env.local

# Vapi Configuration
VAPI_API_KEY=your-vapi-private-key
NEXT_PUBLIC_VAPI_PUBLIC_KEY=your-vapi-public-key
VAPI_SERVER_SECRET=your-random-secret-string-here

# Twilio Configuration (use TEST credentials first!)
# TEST Account (for development)
TWILIO_ACCOUNT_SID=your-twilio-test-account-sid
TWILIO_AUTH_TOKEN=your-twilio-test-auth-token

# LIVE Account (for production - use after testing)
# TWILIO_ACCOUNT_SID=your-twilio-live-account-sid
# TWILIO_AUTH_TOKEN=your-twilio-live-auth-token

# Optional: Dedicated sub-account for phone pool
TWILIO_POOL_SUB_ACCOUNT_SID=

# App URL (use ngrok URL for local testing with webhooks)
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000

# Optional: GoHighLevel CRM sync
GHL_API_KEY=your-ghl-key
GHL_LOCATION_ID=your-location-id
```

### Step 2: Setup ngrok for Local Webhook Testing

Vapi needs to send webhooks to your server. For local testing, use ngrok:

```bash
# Terminal 1: Start your app
npm run dev

# Terminal 2: Start ngrok
ngrok http 3000

# You'll see output like:
# Forwarding: https://abc123.ngrok.io -> http://localhost:3000
```

**Update your .env.local:**

```bash
NEXT_PUBLIC_APP_BASE_URL=https://abc123.ngrok.io
```

**Restart your server** to pick up the new URL.

### Step 3: Verify Webhook Endpoint

Test that your webhook is accessible:

```bash
# Check webhook endpoint
curl https://your-ngrok-url.ngrok.io/api/vapi/webhook
# Should return: {"message":"Vapi webhook endpoint"}
```

## Testing Options

Choose what to test based on your needs:

1. **Simple Agent** - Basic AI assistant (quickest)
2. **Agent with Knowledge Base** - AI that answers from your documents
3. **Agent with Tools** - AI that can take actions (book appointments)
4. **Squad** - Multiple assistants with routing (most advanced)

---

## Test 1: Simple AI Assistant

### Create Basic Agent

```bash
curl -X POST http://localhost:3000/api/agent/setup \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Test Company",
    "customerEmail": "test@example.com",
    "agentName": "Support Agent",
    "agentType": "customer-support",
    "voiceId": "21m00Tcm4TlvDq8ikWAM",
    "systemPrompt": "You are a helpful customer service agent for Test Company. Answer questions professionally and be friendly.",
    "areaCode": "415"
  }'
```

### Expected Response

```json
{
  "success": true,
  "agent": {
    "id": "asst_xxx",
    "name": "Support Agent",
    "phoneNumber": "+14155551234",
    "vapiAssistantId": "asst_xxx",
    "vapiPhoneNumberId": "ph_xxx",
    "twilioPhoneSid": "PNxxx"
  },
  "message": "AI agent setup completed successfully"
}
```

### Test the Call

1. **Call the phone number** from your mobile
2. **Expected behavior:**
   - AI answers: "Thank you for calling Test Company! How can I help you today?"
   - You can have a conversation
   - AI responds naturally

3. **Check server logs** for webhook events:
   ```
   [Vapi Webhook] Call starting - callId: call_xxx
   [Vapi Webhook] Status update: in-progress
   [Vapi Webhook] End-of-call report received
   [Vapi Webhook] Transcript: "Hello! I was wondering..."
   ```

---

## Test 2: Agent with Knowledge Base (RAG)

Knowledge Base allows your AI to answer questions from your business documents.

### Create Agent with Knowledge Base

```bash
curl -X POST http://localhost:3000/api/agent/setup-squad \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Test Dental",
    "customerEmail": "test@dental.com",
    "squadType": "dental-clinic",
    "areaCode": "415",
    "businessInfo": {
      "services": [
        "Dental Cleanings - $150",
        "Fillings - $200-400",
        "Root Canals - $800",
        "Teeth Whitening - $500",
        "Emergency Visits - $200"
      ],
      "hours": "Monday-Friday 9am-6pm, Saturday 9am-2pm",
      "location": "123 Main Street, San Francisco, CA 94102",
      "insurance": "We accept BlueCross, Aetna, Cigna, and Delta Dental",
      "policies": "24-hour cancellation required. Late cancellation fee: $50"
    }
  }'
```

### What Happens Behind the Scenes

1. ✅ **Knowledge Base Created** - Business info uploaded to Vapi
2. ✅ **Squad Created** - 3 assistants (Triage, Emergency, Scheduler)
3. ✅ **Phone Purchased** - Twilio number acquired
4. ✅ **Phone Linked** - Number connected to squad

### Test Knowledge Base Queries

Call the number and ask:

**Question 1: "Do you accept BlueCross insurance?"**
- ✅ AI should respond: "Yes! We accept BlueCross, along with Aetna, Cigna, and Delta Dental."

**Question 2: "What are your hours?"**
- ✅ AI should respond: "We're open Monday through Friday from 9am to 6pm, and Saturday from 9am to 2pm."

**Question 3: "How much does a cleaning cost?"**
- ✅ AI should respond: "Dental cleanings are $150."

**Question 4: "What's your cancellation policy?"**
- ✅ AI should respond: "We require 24-hour notice for cancellations. There's a $50 fee for late cancellations."

### Check Knowledge Base Upload

```bash
# View server logs during setup - you should see:
[Vapi] Uploading knowledge file - fileName: Test Dental - Knowledge Base
[Vapi] Successfully uploaded knowledge file - fileId: file_xxx
[Squad Setup] Creating dental clinic squad
[Vapi] Successfully created squad - squadId: squad_xxx
```

---

## Test 3: Tool Calls (Function Calling)

Tools let your AI take actions like booking appointments or checking availability.

### How Tool Calls Work

When you create a squad (Test 2), tools are automatically configured:

**Tool 1: `checkAvailability`**
- AI: "Let me check our available times..."
- Calls your webhook with parameters
- You return available slots
- AI: "We have openings at 2pm and 4pm"

**Tool 2: `bookAppointment`**
- AI: "I'll book that for you..."
- Calls your webhook with booking details
- You save to database
- AI: "Great! Your appointment is confirmed for Monday at 2pm. Confirmation number: APT-12345"

### Test Tool Calls

Call the squad number and say:

**"I'd like to book a cleaning for next Monday at 2pm"**

**Expected flow:**

1. AI extracts: service=cleaning, date=Monday, time=2pm
2. AI calls `bookAppointment` tool
3. Your webhook receives:
   ```json
   {
     "functionCall": {
       "name": "bookAppointment",
       "parameters": {
         "patientName": "John Doe",
         "phoneNumber": "+1234567890",
         "serviceType": "cleaning",
         "preferredDate": "2024-02-05",
         "preferredTime": "14:00"
       }
     }
   }
   ```
4. Your webhook responds:
   ```json
   {
     "result": {
       "success": true,
       "confirmationNumber": "APT-12345",
       "confirmedDate": "2024-02-05",
       "confirmedTime": "14:00"
     }
   }
   ```
5. AI says: "Perfect! I've booked your cleaning for Monday, February 5th at 2pm. Your confirmation number is APT-12345."

### Check Tool Call Logs

```bash
# Server logs should show:
[Vapi Webhook] Function call: bookAppointment
[Vapi Webhook] Parameters: {
  patientName: "John Doe",
  serviceType: "cleaning",
  preferredDate: "2024-02-05"
}
[Vapi Webhook] Returning result to Vapi
```

### Customize Tool Implementation

Edit `/apps/frontend/apps/web/app/api/vapi/webhook/route.ts`:

```typescript
case 'function-call':
  const { functionCall } = message;
  
  if (functionCall.name === 'bookAppointment') {
    // YOUR CUSTOM LOGIC HERE
    const appointment = await yourBookingSystem.create({
      patient: functionCall.parameters.patientName,
      phone: functionCall.parameters.phoneNumber,
      service: functionCall.parameters.serviceType,
      date: functionCall.parameters.preferredDate,
      time: functionCall.parameters.preferredTime
    });
    
    return NextResponse.json({
      result: {
        success: true,
        confirmationNumber: appointment.id,
        confirmedDate: appointment.date,
        confirmedTime: appointment.time
      }
    });
  }
```

---

## Test 4: Squad (Multi-Assistant Routing)

Squads route calls between specialized assistants.

### Understanding the Squad Flow

```
Customer calls → Triage Assistant (first contact)
                      ↓
        ┌─────────────┴─────────────┐
        ↓                           ↓
Emergency Assistant        Scheduler Assistant
(urgent cases)             (routine bookings)
```

### Test Squad Routing

**Scenario 1: Emergency Case**

Call and say: "I have severe tooth pain, it's unbearable!"

**Expected:**
1. Triage: "I understand. That sounds urgent. How long have you been experiencing this?"
2. You: "Since this morning, it's getting worse."
3. Triage: "I'm going to connect you to our emergency team right away."
4. **[TRANSFER]** → Emergency Assistant
5. Emergency: "I'm here to help. Let's get you in today. What's your name and phone number?"
6. Emergency uses `bookAppointment` tool
7. Emergency: "I've booked you for an emergency visit at 3pm today."

**Scenario 2: Routine Appointment**

Call and say: "I'd like to schedule a cleaning."

**Expected:**
1. Triage: "I can help with that! Let me connect you to our scheduler."
2. **[TRANSFER]** → Scheduler Assistant
3. Scheduler: "I'd be happy to help you schedule a cleaning! When works best for you?"
4. Scheduler uses `checkAvailability` and `bookAppointment` tools

**Scenario 3: Question Only**

Call and say: "Do you accept my insurance?"

**Expected:**
1. Triage: (uses knowledge base) "Yes! We accept BlueCross, Aetna, Cigna, and Delta Dental. Which insurance do you have?"
2. **[NO TRANSFER]** - Triage can answer directly

### Check Squad Transfer Logs

```bash
# Server logs should show:
[Vapi Webhook] Assistant: Triage Assistant
[Vapi Webhook] Transfer initiated to: Emergency Assistant
[Vapi Webhook] Transfer complete
[Vapi Webhook] New assistant: Emergency Assistant
```

### Verify Squad in Vapi Dashboard

1. Go to [Vapi Dashboard](https://dashboard.vapi.ai/)
2. Click "Squads" in sidebar
3. Find your squad: "Test Dental - Dental Clinic"
4. Click to view:
   - ✅ 3 members (Triage, Emergency, Scheduler)
   - ✅ Transfer rules configured
   - ✅ Phone number linked

---

## Twilio Phone Configuration in Vapi

### What Happens During Setup

When you call `/api/agent/setup` or `/api/agent/setup-squad`:

1. **Twilio**: Purchases phone number
2. **Vapi**: Creates assistant(s)
3. **Vapi**: Imports Twilio number using API
4. **Vapi**: Links phone → assistant(s)

### Manual Phone Configuration (Optional)

If you want to manually link an existing Twilio number to Vapi:

#### Option A: Via API

```bash
curl -X POST https://api.vapi.ai/phone-number \
  -H "Authorization: Bearer your-vapi-private-key" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "twilio",
    "twilioAccountSid": "your-twilio-account-sid",
    "twilioAuthToken": "your-twilio-auth-token",
    "number": "+14155551234",
    "assistantId": "asst_xxx"
  }'
```

#### Option B: Via Vapi Dashboard

1. Go to [Vapi Dashboard](https://dashboard.vapi.ai/)
2. Click "Phone Numbers" → "Import Number"
3. Select "Twilio"
4. Enter:
   - Account SID: `your-twilio-account-sid`
   - Auth Token: `your-twilio-auth-token`
   - Phone Number: `+14155551234`
5. Select Assistant or Squad to link
6. Click "Import"

### Verify Phone Configuration

```bash
# Check phone number in Vapi
curl https://api.vapi.ai/phone-number \
  -H "Authorization: Bearer your-vapi-private-key"

# Response should show:
{
  "id": "ph_xxx",
  "number": "+14155551234",
  "provider": "twilio",
  "assistantId": "asst_xxx", // or squadId
  "createdAt": "..."
}
```

---

## Complete Test Checklist

### Environment Setup
- [ ] `.env.local` configured with all credentials
- [ ] ngrok running and URL updated in `.env.local`
- [ ] Server restarted after env changes
- [ ] Webhook endpoint accessible

### Simple Agent Test
- [ ] Agent created successfully
- [ ] Phone number received
- [ ] Can call the number
- [ ] AI answers with first message
- [ ] AI responds to questions naturally
- [ ] Webhook receives call start event
- [ ] Webhook receives end-of-call report
- [ ] Transcript is accurate

### Knowledge Base Test
- [ ] Squad created with knowledge base
- [ ] AI answers questions from business info
- [ ] Insurance question answered correctly
- [ ] Hours question answered correctly
- [ ] Pricing question answered correctly
- [ ] Policy question answered correctly

### Tool Call Test
- [ ] Say "book appointment" triggers tool
- [ ] Webhook receives function call
- [ ] Parameters extracted correctly
- [ ] Your response returned to AI
- [ ] AI confirms booking with details
- [ ] Server logs show tool call flow

### Squad Routing Test
- [ ] Emergency scenario transfers to Emergency assistant
- [ ] Routine scenario transfers to Scheduler
- [ ] Question-only stays with Triage
- [ ] Context preserved during transfer
- [ ] Transfer is smooth and natural
- [ ] Each assistant behaves appropriately

### Data Extraction Test
- [ ] Provide name, phone, email during call
- [ ] End-of-call report includes analysis
- [ ] Structured data extracted correctly
- [ ] GHL contact created (if enabled)
- [ ] Custom fields populated
- [ ] Tags added correctly

### Recording Test
- [ ] Recording URL in end-of-call report
- [ ] Recording URL accessible
- [ ] Audio quality is good
- [ ] Full conversation recorded

---

## Common Issues & Solutions

### Issue 1: "Twilio integration not configured"

**Cause**: Missing Twilio credentials

**Solution**:
```bash
# Add to .env.local
TWILIO_ACCOUNT_SID=your-twilio-test-account-sid
TWILIO_AUTH_TOKEN=your-twilio-test-auth-token

# Restart server
npm run dev
```

### Issue 2: "Vapi integration not configured"

**Cause**: Missing Vapi API key

**Solution**:
```bash
# Add to .env.local
VAPI_API_KEY=your-vapi-private-key

# Restart server
npm run dev
```

### Issue 3: "No available phone numbers found"

**Cause**: 
- No numbers in that area code
- Twilio account has insufficient funds
- Using TEST credentials (limited inventory)

**Solution**:
```bash
# Try different area code
"areaCode": "212"  # New York
"areaCode": "310"  # Los Angeles
"areaCode": "650"  # San Mateo

# Or check Twilio balance
# Add funds if needed

# Or switch to LIVE credentials (more inventory)
TWILIO_ACCOUNT_SID=your-twilio-live-account-sid
```

### Issue 4: Webhook not receiving data

**Cause**: Vapi can't reach your localhost

**Solution**:
```bash
# Use ngrok
ngrok http 3000

# Update .env.local with ngrok URL
NEXT_PUBLIC_APP_BASE_URL=https://abc123.ngrok.io

# Restart server
npm run dev

# Verify webhook is accessible
curl https://abc123.ngrok.io/api/vapi/webhook
```

### Issue 5: Call connects but AI doesn't respond

**Cause**:
- Invalid voice ID
- Empty system prompt
- Vapi API error

**Solution**:
1. Check [Vapi Dashboard](https://dashboard.vapi.ai/) for errors
2. Verify voice ID is valid (use: `21m00Tcm4TlvDq8ikWAM`)
3. Ensure system prompt isn't empty
4. Check Vapi logs for errors

### Issue 6: Knowledge Base not working

**Cause**:
- Knowledge file upload failed
- fileIds not passed to assistant
- topK too low

**Solution**:
```bash
# Check logs for:
[Vapi] Successfully uploaded knowledge file - fileId: file_xxx

# If missing, knowledge base wasn't created
# Verify businessInfo is provided in request

# Or check Vapi Dashboard → Files
```

### Issue 7: Tool calls not triggering

**Cause**:
- AI doesn't understand when to use tool
- Tool description unclear
- Webhook not responding

**Solution**:
1. Make tool descriptions very clear
2. Test webhook manually:
   ```bash
   curl -X POST http://localhost:3000/api/vapi/webhook \
     -H "Content-Type: application/json" \
     -d '{"message":{"type":"function-call","functionCall":{"name":"bookAppointment"}}}'
   ```
3. Check server logs for errors
4. Be explicit: "Please book me an appointment"

### Issue 8: Squad transfers not working

**Cause**:
- Transfer destinations not configured
- AI doesn't understand when to transfer
- Assistant names don't match

**Solution**:
1. Verify in Vapi Dashboard → Squad → members → destinations
2. Be very explicit: "I have severe pain" (emergency keyword)
3. Check assistant names match exactly in destinations

---

## Performance Metrics

Track these metrics during testing:

| Metric | Target | Notes |
|--------|--------|-------|
| Setup Time | < 15 seconds | From API call to callable number |
| First Response | < 2 seconds | AI first word after call connects |
| Tool Call Latency | < 5 seconds | From trigger to result |
| Transfer Time | < 3 seconds | Squad member switch |
| Transcript Accuracy | > 95% | Word-for-word match |
| Data Extraction | > 90% | Name, phone, email captured |
| Cost per Minute | ~$0.08 | Vapi $0.07 + Twilio $0.013 |

---

## Advanced: Testing Different Voice Options

Vapi supports multiple voice providers. Test different voices:

```bash
# ElevenLabs voices (most natural)
"voiceId": "21m00Tcm4TlvDq8ikWAM"  # Rachel - calm, professional
"voiceId": "pNInz6obpgDQGcFmaJgB"  # Adam - authoritative
"voiceId": "EXAVITQu4vr4xnSDxMaL"  # Bella - warm, friendly

# PlayHT voices (fast, cheap)
"voiceId": "jennifer"
"voiceId": "matt"

# Deepgram voices (fastest)
"voiceId": "aura-asteria-en"
```

Change voice in your setup call:

```bash
curl -X POST http://localhost:3000/api/agent/setup \
  -H "Content-Type: application/json" \
  -d '{
    ...
    "voiceId": "EXAVITQu4vr4xnSDxMaL",  # Try Bella
    ...
  }'
```

---

## Testing with Multiple Scenarios

### Scenario 1: Lead Capture
**Goal**: Extract customer contact info

**Script**: 
- "Hi, my name is Jane Smith"
- "My email is jane@example.com"
- "You can reach me at 555-123-4567"

**Expected**:
```json
{
  "analysis": {
    "customerName": "Jane Smith",
    "email": "jane@example.com",
    "phoneNumber": "555-123-4567"
  }
}
```

### Scenario 2: Appointment Booking
**Goal**: Test tool call execution

**Script**:
- "I'd like to book a cleaning"
- "Next Monday at 2pm works for me"
- "My name is John Doe, phone 555-9876"

**Expected**:
- AI calls `checkAvailability` tool
- AI calls `bookAppointment` tool
- AI confirms: "Your appointment is booked for Monday at 2pm. Confirmation: APT-12345"

### Scenario 3: Emergency Triage
**Goal**: Test squad routing to emergency

**Script**:
- "I have severe tooth pain"
- "It started this morning and it's unbearable"
- "There's some swelling too"

**Expected**:
- Triage identifies emergency keywords
- Transfers to Emergency assistant
- Emergency books same-day appointment

### Scenario 4: Knowledge Base Query
**Goal**: Test RAG retrieval

**Script**:
- "Do you take Delta Dental insurance?"
- "What are your hours on Saturday?"
- "How much does teeth whitening cost?"

**Expected**:
- AI retrieves from knowledge base
- Accurate answers from business info
- No hallucinations or made-up info

### Scenario 5: Negative Sentiment
**Goal**: Test sentiment analysis

**Script**:
- "This is the worst service I've ever received"
- "I'm extremely disappointed"
- "I want to speak to a manager"

**Expected**:
```json
{
  "analysis": {
    "sentiment": "negative",
    "reason": "customer dissatisfaction"
  }
}
```

---

## Production Readiness Checklist

Before deploying to production:

### Security
- [ ] Switch from TEST to LIVE Twilio credentials
- [ ] Use strong `VAPI_SERVER_SECRET` (32+ random chars)
- [ ] Enable webhook signature verification
- [ ] Use HTTPS only (no HTTP)
- [ ] Environment variables in secure vault

### Monitoring
- [ ] Set up error logging (Sentry, DataDog, etc.)
- [ ] Monitor webhook delivery rate
- [ ] Track call success rate
- [ ] Alert on high error rates
- [ ] Monitor Twilio and Vapi spend

### Cost Management
- [ ] Set Twilio spending alerts
- [ ] Set Vapi spending alerts
- [ ] Monitor per-call costs
- [ ] Set up billing notifications
- [ ] Budget: ~$0.08/min + $1-3/number/month

### Backup & Redundancy
- [ ] Document all assistant/squad IDs
- [ ] Backup system prompts and configs
- [ ] Test failover scenarios
- [ ] Have backup phone numbers
- [ ] Document rollback procedure

### Compliance
- [ ] Add call recording disclosure
- [ ] Review TCPA compliance
- [ ] Add opt-out mechanism
- [ ] Document data retention policy
- [ ] Review HIPAA if medical (squad example)

---

## Next Steps After Successful Test

1. ✅ **All tests passing** - Integration working!

2. **Create production assistants**:
   - Use LIVE Twilio credentials
   - Fine-tune system prompts
   - Add more knowledge base content
   - Configure all tools needed

3. **Build management UI**:
   - Agent creation form
   - Call history dashboard
   - Analytics & reporting
   - Number management

4. **Add features**:
   - Voicemail detection
   - SMS follow-ups
   - Call routing rules
   - Business hours handling

5. **Remove GHL AI agent code**:
   - Keep GHL CRM functions (contacts, tags)
   - Remove GHL Voice AI integration
   - Clean up unused dependencies
   - Update documentation

6. **Deploy to production**:
   - Set production environment variables
   - Test end-to-end in production
   - Monitor for first week
   - Iterate based on usage

---

## Troubleshooting Decision Tree

```
Issue: Call not working
    ↓
├─ Can't dial number?
│   ├─ Number purchased? → Check Twilio dashboard
│   ├─ Number linked to Vapi? → Check Vapi dashboard
│   └─ Correct format? → Must be E.164: +14155551234
│
├─ Call connects but no AI response?
│   ├─ Check Vapi dashboard logs
│   ├─ Verify assistant ID correct
│   └─ Test different voice ID
│
├─ AI responds but webhook not firing?
│   ├─ ngrok running? → Check tunnel
│   ├─ URL correct? → Check NEXT_PUBLIC_APP_BASE_URL
│   └─ Webhook endpoint accessible? → curl test
│
├─ Knowledge base not working?
│   ├─ File uploaded? → Check logs for fileId
│   ├─ fileIds in config? → Verify assistant config
│   └─ Ask specific questions → Test different queries
│
├─ Tool calls not triggering?
│   ├─ Tool description clear? → Make more explicit
│   ├─ Webhook responding? → Check logs
│   └─ Right parameters? → Verify schema
│
└─ Squad transfers failing?
    ├─ Destinations configured? → Check Vapi dashboard
    ├─ Keywords used? → Be explicit: "emergency"
    └─ Assistant names match? → Check exact spelling
```

---

## Cost Breakdown

### Per-Call Costs (5-minute call example)

| Service | Cost | Notes |
|---------|------|-------|
| Vapi AI | $0.35 | $0.07/min × 5 min |
| Twilio Voice | $0.065 | $0.013/min × 5 min |
| **Total per call** | **$0.415** | Less than 50¢! |

### Monthly Costs (100 calls/month, 5 min avg)

| Item | Cost | Calculation |
|------|------|-------------|
| Vapi calls | $35 | 100 calls × $0.35 |
| Twilio calls | $6.50 | 100 calls × $0.065 |
| Phone numbers | $3 | 3 numbers × $1/month |
| **Total/month** | **$44.50** | For 100 calls! |

**Compared to alternatives:**
- Traditional call center: $1,500/month (100 hours)
- GHL Voice AI: $97/month + per-minute fees
- **This solution**: $44.50/month ✅

---

## Success Criteria

Your integration is production-ready when:

✅ **Setup**
- Agent/squad created in < 15 seconds
- Phone number immediately callable
- No manual Vapi dashboard configuration needed

✅ **Functionality**
- AI responds naturally within 2 seconds
- Knowledge base answers accurately
- Tool calls execute correctly
- Squad transfers smoothly
- Context preserved during transfers

✅ **Data Quality**
- Transcript >95% accurate
- Data extraction >90% success
- Recordings accessible
- Webhooks 100% delivered

✅ **Reliability**
- Zero dropped calls during testing
- Consistent response quality
- Error handling works
- Logs show no critical errors

✅ **Cost**
- Per-call cost ~$0.08/minute
- Monthly phone cost ~$1/number
- No surprise charges
- Spending alerts configured

If all criteria met, **you're ready for production!** 🎉

---

## Need Help?

### Documentation
- `/docs/VAPI_ADVANCED_FEATURES.md` - Squads, Knowledge Base, Tools
- `/docs/VAPI_TWILIO_INTEGRATION.md` - Basic setup guide
- `/docs/AUTOMATED_AGENT_SETUP.md` - Automation details
- `/docs/GHL_AGENCY_PHONE_NUMBERS.md` - GHL integration

### External Resources
- [Vapi Documentation](https://docs.vapi.ai/)
- [Vapi Dashboard](https://dashboard.vapi.ai/)
- [Twilio Console](https://console.twilio.com/)
- [Squad Examples](https://docs.vapi.ai/squads/examples/clinic-triage-scheduling)

### Support
- Vapi: support@vapi.ai
- Twilio: https://support.twilio.com/

---

## Quick Reference: Test Commands

```bash
# 1. Simple agent
curl -X POST http://localhost:3000/api/agent/setup \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Test Co","agentName":"Support","voiceId":"21m00Tcm4TlvDq8ikWAM","systemPrompt":"You are helpful","areaCode":"415"}'

# 2. Squad with knowledge base
curl -X POST http://localhost:3000/api/agent/setup-squad \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Test Dental","squadType":"dental-clinic","areaCode":"415","businessInfo":{"services":["Cleanings"],"hours":"Mon-Fri 9-6"}}'

# 3. Check webhook
curl https://your-ngrok.ngrok.io/api/vapi/webhook

# 4. List Vapi assistants
curl https://api.vapi.ai/assistant \
  -H "Authorization: Bearer your-vapi-private-key"

# 5. List Twilio numbers
curl https://api.twilio.com/2010-04-01/Accounts/your-twilio-account-sid/IncomingPhoneNumbers.json \
  -u "your-twilio-account-sid:your-twilio-auth-token"

# 6. Test ngrok tunnel
curl https://your-ngrok.ngrok.io/api/health
```

Happy testing! 🚀
