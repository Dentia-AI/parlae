# Vapi Advanced Features: Squads, Knowledge Base & Tools

## Overview

This guide covers Vapi's advanced features for building sophisticated AI voice agents:

1. **Squads** - Multi-assistant workflows with intelligent routing
2. **Knowledge Base (RAG)** - Train AI with your business documents
3. **Tool/Function Calls** - Let AI execute actions (book appointments, check availability)

## 1. Squads (Multi-Assistant Workflows)

### What are Squads?

Squads allow multiple specialized assistants to work together, transferring conversations between them based on context.

**Perfect for:**
- **Healthcare**: Triage → Emergency/Routine
- **Sales**: Qualifier → Demo Scheduler → Account Manager
- **Support**: L1 → L2 → Engineering Escalation

### Example: Dental Clinic Squad

Based on [Vapi's clinic triage example](https://docs.vapi.ai/squads/examples/clinic-triage-scheduling):

```typescript
POST /api/agent/setup-squad
{
  "customerName": "Smile Dental",
  "customerEmail": "admin@smiledental.com",
  "squadType": "dental-clinic",
  "areaCode": "415",
  "businessInfo": {
    "services": [
      "Dental Cleanings",
      "Fillings",
      "Root Canals",
      "Cosmetic Dentistry",
      "Emergency Services"
    ],
    "hours": "Mon-Fri 9am-6pm, Sat 9am-2pm",
    "location": "123 Main St, San Francisco, CA",
    "insurance": "We accept most major insurance plans"
  }
}
```

### Squad Members:

#### 1. Triage Assistant (First Contact)
- **Role**: Greets caller, assesses urgency
- **Routes to**:
  - **Emergency Assistant** if severe pain, bleeding, trauma
  - **Scheduler Assistant** for routine care
  
```typescript
{
  name: 'Triage Assistant',
  systemPrompt: `Identify if it's an emergency...`,
  firstMessage: "Thank you for calling! How can I help?",
  assistantDestinations: [
    { assistantName: 'Emergency Assistant', description: 'Urgent issues' },
    { assistantName: 'Scheduler Assistant', description: 'Routine appointments' }
  ]
}
```

#### 2. Emergency Assistant
- **Role**: Handles urgent cases
- **Actions**: 
  - Provides first aid advice
  - Books SAME-DAY emergency appointment
  - Directs to ER if needed

```typescript
{
  name: 'Emergency Assistant',
  systemPrompt: `Stay calm, gather info quickly, book emergency appointment`,
  tools: [bookAppointmentTool]
}
```

#### 3. Scheduler Assistant
- **Role**: Books routine appointments
- **Tools**:
  - `checkAvailability` - Find open slots
  - `bookAppointment` - Confirm booking

```typescript
{
  name: 'Scheduler Assistant',
  systemPrompt: `Friendly scheduler, offer 2-3 time slots`,
  tools: [checkAvailabilityTool, bookAppointmentTool]
}
```

### How Transfers Work

```
Call Flow:
┌────────────────┐
│    Customer    │
│     Calls      │
└────────┬───────┘
         │
         ▼
┌────────────────────────────┐
│   Triage Assistant         │
│   "What brings you in?"    │
└────────┬───────────────────┘
         │
         ├─ "Severe pain!" ──────────┐
         │                           │
         ▼                           ▼
┌────────────────┐        ┌──────────────────┐
│   Scheduler    │        │    Emergency     │
│   "Let me book │        │   "See you now!" │
│   you for..."  │        └──────────────────┘
└────────────────┘
```

**Context Preservation**: Full conversation history is passed to the next assistant!

## 2. Knowledge Base (RAG)

### Upload Business Documents

Vapi can retrieve information from your documents to answer questions accurately.

#### Upload Knowledge File

```typescript
// Upload text content
const fileId = await vapiService.uploadKnowledgeFile({
  name: 'Business Information',
  content: `
    Services: Dental cleanings, fillings, root canals
    Hours: Mon-Fri 9am-6pm
    Location: 123 Main St, San Francisco
    Insurance: We accept BlueCross, Aetna, Cigna
    Pricing: Cleanings $150, Fillings $200-400
  `,
  type: 'text'
});

// Or upload from URL
const fileId = await vapiService.uploadKnowledgeFile({
  name: 'Service Menu PDF',
  url: 'https://example.com/services.pdf',
  type: 'url'
});
```

#### Use in Assistant

```typescript
{
  model: {
    provider: 'openai',
    model: 'gpt-4o',
    systemPrompt: `You are a helpful assistant for our dental practice.`,
    knowledgeBase: {
      provider: 'canonical',
      topK: 3, // Return top 3 most relevant chunks
      fileIds: [fileId]
    }
  }
}
```

**How it works:**
1. Customer asks: "Do you accept my insurance?"
2. AI searches knowledge base for "insurance"
3. Finds: "We accept BlueCross, Aetna, Cigna"
4. AI responds: "Yes! We accept BlueCross, Aetna, and Cigna insurance"

### Supported File Types

- ✅ PDF documents
- ✅ Text files
- ✅ Web pages (URLs)
- ✅ Word documents
- ✅ Markdown files

## 3. Tools & Function Calls

### Define Tools

Tools let your AI take actions during calls.

#### Example: Book Appointment Tool

```typescript
const bookAppointmentTool = {
  type: 'function',
  function: {
    name: 'bookAppointment',
    description: 'Books a dental appointment',
    parameters: {
      type: 'object',
      properties: {
        patientName: { type: 'string', description: 'Patient name' },
        phoneNumber: { type: 'string' },
        email: { type: 'string' },
        serviceType: { 
          type: 'string',
          enum: ['cleaning', 'filling', 'emergency'],
          description: 'Type of service'
        },
        preferredDate: { type: 'string', description: 'YYYY-MM-DD' },
        preferredTime: { type: 'string', description: 'HH:MM' }
      },
      required: ['patientName', 'phoneNumber', 'serviceType']
    }
  },
  async: false, // Wait for response
  server: {
    url: 'https://yourapp.com/api/vapi/webhook',
    secret: 'your-secret',
    timeoutSeconds: 20
  },
  messages: [
    {
      type: 'request-start',
      content: 'Let me check our calendar...'
    },
    {
      type: 'request-complete',
      content: 'Great! Your appointment is booked.'
    }
  ]
};
```

#### Use in Assistant

```typescript
{
  name: 'Scheduler',
  tools: [bookAppointmentTool, checkAvailabilityTool],
  systemPrompt: `Use bookAppointment tool when ready to confirm`
}
```

### Handle Tool Calls

```typescript
// In /api/vapi/webhook
case 'function-call':
  const { name, parameters } = payload.message.functionCall;
  
  if (name === 'bookAppointment') {
    // Your booking logic
    const appointment = await bookInYourSystem({
      patient: parameters.patientName,
      phone: parameters.phoneNumber,
      date: parameters.preferredDate,
      time: parameters.preferredTime,
      service: parameters.serviceType
    });
    
    // Return result to Vapi
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

### Tool Call Flow

```
Customer: "I'd like to book a cleaning for next Monday at 2pm"
    ↓
AI: (Understands intent, extracts: cleaning, Monday, 2pm)
    ↓
AI: Calls bookAppointment tool
    {
      patientName: "John Doe",
      serviceType: "cleaning",
      preferredDate: "2024-02-05",
      preferredTime: "14:00"
    }
    ↓
Your Server: Books in database, returns confirmation
    ↓
AI: "Perfect! I've booked your cleaning for Monday, Feb 5th at 2pm. 
     Your confirmation number is APT-12345."
```

## Complete Example: Setup with All Features

```typescript
POST /api/agent/setup-squad
{
  "customerName": "Smile Dental",
  "customerEmail": "admin@smiledental.com",
  "squadType": "dental-clinic",
  "areaCode": "415",
  "businessInfo": {
    // This becomes the knowledge base
    "services": [
      "Dental Cleanings - $150",
      "Fillings - $200-400",
      "Root Canals - $800-1200",
      "Whitening - $500",
      "Emergency Visits - $200"
    ],
    "hours": "Mon-Fri 9am-6pm, Sat 9am-2pm, Closed Sunday",
    "location": "123 Main St, San Francisco, CA 94102",
    "insurance": "We accept: BlueCross, Aetna, Cigna, Delta Dental",
    "pricing": "All prices are estimates. Insurance may cover portions.",
    "policies": "24-hour cancellation policy. Late fee: $50."
  }
}
```

**What Happens:**

1. ✅ Purchases Twilio phone number
2. ✅ Uploads knowledge base file
3. ✅ Creates 3-assistant squad:
   - Triage (answers questions using knowledge base)
   - Emergency (books emergency appointments)
   - Scheduler (checks availability, books appointments)
4. ✅ Links phone to squad
5. ✅ Configures webhook for tool calls

**Customer Experience:**

```
Customer: "Hi, do you take BlueCross insurance?"
Triage: "Yes! We accept BlueCross, along with Aetna, Cigna, and Delta Dental."

Customer: "Great! I have a toothache."
Triage: "I'm sorry to hear that. How severe is the pain? Is it unbearable or manageable?"

Customer: "It's pretty bad, constant throbbing."
Triage: "I understand. Let me connect you to our emergency team right away."
    [Transfers to Emergency Assistant]

Emergency: "I'm here to help. Let's get you in today. What's your name and phone number?"

Customer: "John Doe, 415-555-1234"
Emergency: [Calls bookAppointment tool]
Emergency: "John, I've booked you for an emergency visit today at 3pm. We'll take care of you!"
```

## Testing Tools Locally

### 1. Setup Webhook

```typescript
// /api/vapi/webhook/route.ts
case 'function-call':
  const { functionCall } = message;
  
  console.log('Tool called:', functionCall.name);
  console.log('Parameters:', functionCall.parameters);
  
  // Simulate booking
  if (functionCall.name === 'bookAppointment') {
    return NextResponse.json({
      result: {
        success: true,
        confirmationNumber: 'TEST-' + Date.now(),
        message: 'Appointment booked successfully!'
      }
    });
  }
```

### 2. Use ngrok for Local Testing

```bash
# Terminal 1: Start your app
npm run dev

# Terminal 2: Expose with ngrok
ngrok http 3000

# Update NEXT_PUBLIC_APP_BASE_URL to ngrok URL
# https://abc123.ngrok.io
```

### 3. Test the Call

1. Create squad
2. Call the phone number
3. Trigger tool call by saying: "I'd like to book an appointment"
4. Check logs for webhook call

## Best Practices

### Squads
- ✅ Keep assistant specialization narrow
- ✅ Use clear transfer messages
- ✅ Test all transfer paths
- ✅ Max 3-4 assistants per squad

### Knowledge Base
- ✅ Keep documents focused and well-structured
- ✅ Use clear headings and bullet points
- ✅ Update regularly
- ✅ Test with common questions

### Tools
- ✅ Clear, descriptive function names
- ✅ Detailed parameter descriptions
- ✅ Handle errors gracefully
- ✅ Return user-friendly messages
- ✅ Keep timeout < 20 seconds

## Cost Impact

| Feature | Cost Impact | Notes |
|---------|-------------|-------|
| Squads | None | Multiple assistants, same per-minute rate |
| Knowledge Base | None | Included in Vapi pricing |
| Tool Calls | Minimal | Adds ~1-2 seconds to response time |

All features: **Still ~$0.07/minute** 🎉

## Next Steps

1. Test simple assistant first
2. Add knowledge base
3. Add 1-2 tools
4. Build squad workflow
5. Test end-to-end
6. Deploy to production

Full documentation:
- `/docs/VAPI_TWILIO_INTEGRATION.md`
- `/docs/VAPI_TESTING_GUIDE.md`
