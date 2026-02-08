# AI Receptionist Onboarding Wizard

## Overview

This document describes the user-facing onboarding wizard for setting up an AI receptionist. This is a **user feature** (not admin), accessible from the workspace area.

## User Flow

### Entry Point

Users access the wizard from:
- `/home/receptionist/setup` - Main entry point
- `/home/receptionist` - Dashboard with "Set Up AI Receptionist" button if not configured

### 5-Step Wizard Flow

```
1. Phone Number → 2. Voice Selection → 3. Knowledge Base → 4. Integrations → 5. Review & Launch
```

---

## Step 1: Phone Number Setup

**Route:** `/home/receptionist/setup`

### Purpose
Get or configure a phone number for the AI receptionist.

### Development Mode
- Uses a hardcoded Twilio trial number (`+15555551234`)
- No actual purchase happens
- Allows testing without cost

### Production Mode
- Calls Twilio API to purchase a number in the requested area code
- Stores Twilio phone number in database
- Links phone to account

### User Input
- **Business Name** (text) - Used for personalization
- **Area Code** (3 digits) - Preferred area code for the number

### On Success
- Displays the assigned phone number in a success card
- Shows copy button for easy sharing
- Continues to voice selection

### Backend Action
```typescript
setupPhoneNumberAction({
  accountId: string,
  areaCode: string,
  businessName: string
})
```

**Returns:**
```typescript
{
  success: boolean,
  phoneNumber: string, // e.g., "+15555551234"
  error?: string
}
```

---

## Step 2: Voice Selection

**Route:** `/home/receptionist/setup/voice?phone=<phone_number>`

### Purpose
Choose the voice personality for the AI receptionist.

### Available Voices

#### 11Labs Voices
1. **Rachel** - Female, American - "Warm and professional, perfect for healthcare"
2. **Josh** - Male, American - "Friendly and approachable, great for customer service"
3. **Bella** - Female, American - "Clear and articulate, excellent for appointments"
4. **Antoni** - Male, American - "Professional and reassuring tone"

#### OpenAI Voices
1. **Alloy** - Neutral - "Balanced and neutral voice"
2. **Echo** - Male, American - "Clear and confident"
3. **Nova** - Female, American - "Energetic and friendly"

### Features
- Filter by gender: All, Male, Female, Neutral
- Preview button for each voice (UI ready, audio coming soon)
- Visual selection with radio buttons
- Provider badge (11labs, OpenAI)

### Data Stored in Session
```typescript
{
  id: string,           // "rachel-11labs"
  name: string,         // "Rachel"
  provider: string,     // "11labs"
  voiceId: string,      // "rachel"
  gender: string,       // "female"
  accent: string,       // "American"
  description: string   // Full description
}
```

---

## Step 3: Knowledge Base

**Route:** `/home/receptionist/setup/knowledge?phone=<phone_number>`

### Purpose
Upload documents to train the AI with business-specific information.

### Features
- **Drag & Drop** file upload
- **Click to browse** files
- File type validation (PDF, DOC, DOCX, TXT)
- Max file size: 10MB per file
- Upload progress indicator
- File list with remove option

### Recommended Documents
- Business hours and location
- Services offered and pricing
- FAQs
- Appointment booking policies
- Insurance and payment information

### File Upload Flow
1. User selects/drops files
2. Files are validated (type, size)
3. Progress bar shows upload status
4. Files are uploaded to Vapi's file API (TODO)
5. File IDs are returned and stored
6. Success notification

### Data Structure
```typescript
interface UploadedFile {
  id: string,           // Unique ID
  name: string,         // "services.pdf"
  size: number,         // Bytes
  status: 'uploading' | 'uploaded' | 'error',
  progress?: number     // 0-100
}
```

### Backend Action
```typescript
uploadKnowledgeBaseAction({
  accountId: string,
  files: File[]
})
```

**Note:** This step is **optional**. Users can continue without uploading files.

---

## Step 4: Integrations (Optional)

**Route:** `/home/receptionist/setup/integrations?phone=<phone_number>`

### Purpose
Connect booking/scheduling software for automatic appointment booking.

### Current Status
All integrations are marked "Coming Soon":
- Calendly
- Acuity Scheduling
- Google Calendar
- Custom API Integration

### Features
- Skip button (recommended for MVP)
- Placeholder cards showing future integrations
- "Contact Support" for custom integrations
- Clear messaging that integrations can be added later

### Data
No data is collected in this step. User can skip or continue.

---

## Step 5: Review & Launch

**Route:** `/home/receptionist/setup/review?phone=<phone_number>`

### Purpose
Review all configuration before deployment.

### Configuration Summary

#### Phone Number
- Displays the assigned phone number
- Explains what it's used for

#### Voice Assistant
- Shows selected voice name, gender, accent, provider
- Displays voice description
- "Change" button to go back to step 2

#### Knowledge Base
- Shows count of uploaded files
- Lists file names (up to 3, then "and X more...")
- "Edit" button to go back to step 3
- Shows message if no files uploaded

#### Integrations
- Shows "No integrations configured"
- Note that integrations can be added later

### Deploy Action

**Button:** "Deploy AI Receptionist"

Triggers backend action that:
1. Creates Vapi assistant with system prompt
2. Creates Vapi squad (single-member for now)
3. Imports phone number to Vapi
4. Links phone to squad
5. Updates database with configuration

### Backend Action
```typescript
deployReceptionistAction({
  phoneNumber: string,
  voice: VoiceConfig,
  files: UploadedFile[]
})
```

**Returns:**
```typescript
{
  success: boolean,
  assistantId: string,
  squadId: string,
  phoneId: string,
  error?: string
}
```

### Success State
- Shows green success card
- "Your AI Receptionist is Live!" message
- Displays phone number
- "Go to Dashboard" button

---

## System Prompt Template

The AI assistant is created with this system prompt:

```
You are <VoiceName>, the friendly AI receptionist for <BusinessName>.

BUSINESS INFORMATION:
- Name: <BusinessName>
- Phone: <PhoneNumber>

YOUR ROLE:
- Greet callers warmly and professionally
- Answer general questions about the business
- Help schedule appointments (when integration is available)
- Transfer urgent matters to staff when needed
- Always be helpful, patient, and empathetic

GUIDELINES:
- Listen carefully to the caller's needs
- Provide clear and concise information
- If you don't know something, politely say so and offer to have someone call back
- For emergencies, immediately offer to transfer to staff
- Keep responses conversational and natural

Remember: You represent <BusinessName>. Always maintain a professional yet friendly tone.
```

---

## Database Schema

### accounts table

Updates to existing `accounts` table:

```sql
ALTER TABLE accounts
ADD COLUMN phone_integration_method TEXT DEFAULT 'none',
ADD COLUMN phone_integration_settings JSONB DEFAULT '{}'::jsonb;
```

**phone_integration_settings structure:**
```typescript
{
  businessName: string,
  areaCode: string,
  phoneNumber?: string,
  vapiAssistantId?: string,
  vapiSquadId?: string,
  vapiPhoneId?: string,
  voiceConfig?: {
    id: string,
    name: string,
    provider: string,
    voiceId: string,
    gender: string,
    accent: string,
    description: string
  },
  knowledgeBaseFileIds?: string[]
}
```

---

## File Structure

```
app/home/(user)/receptionist/
├── page.tsx                              # Dashboard
├── setup/
│   ├── page.tsx                          # Step 1: Phone Setup
│   ├── voice/
│   │   └── page.tsx                      # Step 2: Voice Selection
│   ├── knowledge/
│   │   └── page.tsx                      # Step 3: Knowledge Base
│   ├── integrations/
│   │   └── page.tsx                      # Step 4: Integrations
│   ├── review/
│   │   └── page.tsx                      # Step 5: Review & Launch
│   ├── _components/
│   │   └── phone-setup-form.tsx         # Phone setup form component
│   └── _lib/
│       └── actions.ts                    # Server actions
```

---

## Server Actions

### 1. setupPhoneNumberAction
- **Input:** accountId, areaCode, businessName
- **Output:** phoneNumber
- **Purpose:** Provision phone number (trial in dev, real in prod)

### 2. deployReceptionistAction
- **Input:** phoneNumber, voice config, files
- **Output:** assistant/squad/phone IDs
- **Purpose:** Create Vapi configuration and deploy

### 3. uploadKnowledgeBaseAction
- **Input:** accountId, files
- **Output:** fileIds
- **Purpose:** Upload documents to Vapi knowledge base

---

## Environment Variables

Required for production:

```bash
# Vapi
VAPI_API_KEY=your_vapi_api_key
VAPI_PUBLIC_KEY=your_vapi_public_key

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token

# Development
NODE_ENV=development  # Uses trial numbers when set to development
```

---

## Navigation

Users can:
- Go **Back** at any step (preserves progress)
- **Skip** integrations step
- **Change** voice or knowledge base from review page
- Navigate directly to any step if data is available

---

## Progress Indicator

Uses the `Stepper` component from `@kit/ui/stepper`:

```typescript
<Stepper
  steps={[
    { label: 'Phone Number', status: 'completed' },
    { label: 'Voice Selection', status: 'active' },
    { label: 'Knowledge Base', status: 'upcoming' },
    { label: 'Integrations', status: 'upcoming' },
    { label: 'Review & Launch', status: 'upcoming' },
  ]}
/>
```

Status values:
- `completed` - Step is done (green checkmark)
- `active` - Current step (highlighted)
- `upcoming` - Not yet reached (gray)

---

## Session Storage

Used for temporary data between steps:

```typescript
sessionStorage.setItem('selectedVoice', JSON.stringify(voiceConfig));
sessionStorage.setItem('knowledgeBaseFiles', JSON.stringify(files));
sessionStorage.setItem('skipIntegrations', 'true');
```

**Cleared after successful deployment.**

---

## Error Handling

### Missing Data
- If phone number is missing in URL, redirect to step 1
- If voice is missing at review, show error and disable deploy
- Show user-friendly error messages

### API Failures
- Show toast notifications for upload failures
- Allow retry for failed file uploads
- Log errors to backend for debugging

### Development vs Production
- Clear messaging about trial numbers in dev
- Different behavior for phone provisioning
- Environment-specific error messages

---

## Future Enhancements

1. **Voice Previews**
   - Add audio samples for each voice
   - Play/pause functionality

2. **Booking Integrations**
   - Calendly OAuth flow
   - Google Calendar sync
   - Acuity integration
   - Custom API webhooks

3. **Advanced Configuration**
   - Business hours setup
   - Custom greetings
   - Call routing rules
   - After-hours behavior

4. **Analytics**
   - Call volume tracking
   - Conversation transcripts
   - Sentiment analysis
   - Performance metrics

5. **Testing**
   - In-wizard test call button
   - Conversation playground
   - Voice comparison tool

---

## Testing Checklist

- [ ] Complete wizard flow from start to finish
- [ ] Phone number provisioning (dev mode)
- [ ] Voice selection and filtering
- [ ] File upload (drag & drop and click)
- [ ] Skip integrations
- [ ] Review page shows correct data
- [ ] Deploy creates Vapi resources
- [ ] Success page redirects to dashboard
- [ ] Back navigation preserves data
- [ ] Error states display correctly
- [ ] Session storage cleared after deploy

---

## API Integration Status

### ✅ Implemented
- Phone setup action (dev mode)
- Voice selection (hardcoded list)
- Deploy action structure
- Database updates

### 🚧 TODO
- Twilio phone purchasing (production)
- Vapi file upload API
- Vapi assistant creation (needs testing)
- Vapi squad creation (needs testing)
- Vapi phone import (needs testing)
- Voice preview audio
- Booking integrations

---

## Support & Troubleshooting

### Common Issues

**Issue:** Phone number not showing after setup
- Check database for phone_integration_settings
- Verify action returned successfully
- Check browser console for errors

**Issue:** Voice selection not persisting
- Verify sessionStorage is working
- Check if user navigated away and back
- Ensure voice is being saved on selection

**Issue:** Deploy fails
- Check Vapi API credentials
- Verify Twilio credentials (production)
- Check server logs for detailed error

**Issue:** Files not uploading
- Check file size (10MB limit)
- Verify file type is supported
- Check network connection
- Look for CORS errors

---

## Contact

For questions or issues with the onboarding wizard:
- Check server logs for detailed error messages
- Review Vapi dashboard for created resources
- Verify environment variables are set correctly
