# Complete Phone Integration Implementation Guide

## Overview

This guide covers the complete implementation of phone integration with three methods, call transfer to humans, and a full onboarding UX flow.

## Yes, Call Transfer to Human is Fully Supported!

### How It Works

```
Patient calls → AI Assistant answers → Emergency detected → Transfer to human
```

Vapi supports two transfer methods:

**Method 1: Direct Transfer (Vapi Native)**
```typescript
// In assistant configuration
const emergencyAssistant = {
  tools: [{
    type: 'function',
    function: {
      name: 'transferToHuman',
      description: 'Transfer call to live human agent',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
          summary: { type: 'string' }
        }
      }
    },
    server: {
      url: `${webhookUrl}/api/vapi/tools/transfer-to-human`
    }
  }]
};

// In webhook handler
export async function handleTransferToHuman(params: {
  clinicId: string;
  reason: string;
  summary: string;
  callId: string;
}) {
  // Get staff number from database
  const phoneIntegration = await db.vapiPhoneNumber.findFirst({
    where: { account_id: params.clinicId }
  });
  
  if (!phoneIntegration?.staff_forward_number) {
    return {
      error: 'No staff number configured',
      message: 'I apologize, but I\'m unable to transfer you right now. Please call our direct line at...'
    };
  }
  
  // Use Vapi's transfer function
  // This is handled by returning transfer instructions
  return {
    success: true,
    transferTo: phoneIntegration.staff_forward_number,
    message: `Transferring you to our staff now...`,
    summary: params.summary
  };
}
```

**Method 2: Twilio Conference (More Control)**
```typescript
// Create a conference and add both AI and human
const twiml = new VoiceResponse();
const dial = twiml.dial();
dial.conference({
  statusCallback: `${webhookUrl}/api/twilio/conference-status`,
  statusCallbackEvent: ['start', 'end', 'join', 'leave']
}, `clinic-${clinicId}-${callSid}`);

// Then dial staff number into same conference
await twilioClient.calls.create({
  to: staffForwardNumber,
  from: twilioNumber,
  url: `${webhookUrl}/api/twilio/add-to-conference`,
  statusCallback: `${webhookUrl}/api/twilio/call-status`
});
```

## Routing: Clinic Keeps Their Number!

**YES - The clinic's existing number stays the same for patients!**

Here's how each method works:

### Method 1: Ported to Twilio
```
Patient dials: +1-416-555-1234 (clinic's original number)
  ↓
[Number is now owned by Twilio]
  ↓
Twilio routes to your webhook
  ↓
If AI available → Connect to Vapi
If AI not available → Forward to clinic staff at +1-416-555-5678
```

### Method 2: Call Forwarding
```
Patient dials: +1-416-555-1234 (clinic's original number)
  ↓
[Clinic's carrier forwards to your Twilio number]
  ↓
Twilio receives at: +1-647-555-9999
  ↓
Your webhook checks availability
  ↓
If AI available → Connect to Vapi
If AI not available → Forward back to clinic staff
```

### Method 3: SIP Trunk
```
Patient dials: +1-416-555-1234 (clinic's original number)
  ↓
[Clinic's PBX receives the call]
  ↓
PBX routes based on rules:
  - Business hours → Staff answers directly
  - After hours → SIP to: clinic-slug@parlae.sip.twilio.com
  - Staff busy → SIP to: clinic-slug@parlae.sip.twilio.com
  ↓
Twilio receives SIP call
  ↓
Connect to Vapi (AI answers)
```

**Key Point:** Patients ALWAYS dial the clinic's original number. The routing happens behind the scenes!

## Complete Implementation

### 1. Database Schema

See `VAPI_PHONE_INTEGRATION_IMPLEMENTATION.md` for complete migration.

Key tables:
- `accounts.phone_integration_method` - Which method clinic uses
- `accounts.ai_availability_settings` - When AI should answer
- `vapi_phone_numbers.original_phone_number` - Clinic's public number
- `vapi_phone_numbers.staff_forward_number` - Where to transfer emergencies

### 2. Onboarding Wizard Flow

```typescript
// Step 1: Choose Integration Method
// Component: apps/web/app/home/[account]/phone-setup/choose-method/page.tsx

export default function ChooseMethodPage() {
  return (
    <div>
      <h1>Connect Your Phone Number</h1>
      <p>How would you like patients to reach your AI receptionist?</p>
      
      <MethodCard
        title="Quick Setup (Call Forwarding)"
        description="Set up in 5 minutes. Forward calls from your existing number."
        pros={[
          'Setup in 5 minutes',
          'Keep your existing number',
          'Easy to disable'
        ]}
        cons={[
          'Slightly lower call quality',
          'Limited routing control'
        ]}
        recommended="For trials and quick testing"
        onClick={() => router.push('setup-forwarding')}
      />
      
      <MethodCard
        title="Best Quality (Port Number)"
        description="Transfer your number to us for best call quality."
        pros={[
          'Best call quality',
          'Full feature support',
          'Complete control'
        ]}
        cons={[
          '7-14 day setup time',
          'Requires paperwork'
        ]}
        recommended="For permanent setup"
        onClick={() => router.push('setup-porting')}
      />
      
      <MethodCard
        title="Enterprise (PBX Integration)"
        description="Connect your existing phone system via SIP."
        pros={[
          'Keep your phone system',
          'Flexible routing',
          'After-hours only option'
        ]}
        cons={[
          'Requires IT assistance',
          '15-30 minute setup'
        ]}
        recommended="For businesses with PBX"
        onClick={() => router.push('setup-sip')}
      />
    </div>
  );
}

// Step 2A: Setup Call Forwarding
// Component: apps/web/app/home/[account]/phone-setup/setup-forwarding/page.tsx

export default async function SetupForwardingPage() {
  const workspace = await loadTeamWorkspace();
  
  // Create Twilio number for this clinic
  const twilioNumber = await setupForwardingAction(workspace.account.id);
  
  return (
    <div>
      <h1>Setup Call Forwarding</h1>
      
      <StepProgress currentStep={1} totalSteps={3} />
      
      <Card>
        <h2>Step 1: Call Your Phone Provider</h2>
        <p>Call your current phone provider (Bell, Rogers, Telus, etc.)</p>
      </Card>
      
      <Card>
        <h2>Step 2: Enable Call Forwarding</h2>
        <p>Tell them to forward calls from:</p>
        <CodeBlock>{workspace.account.phone_number}</CodeBlock>
        
        <p>To this number:</p>
        <CodeBlock large>{twilioNumber}</CodeBlock>
        <CopyButton text={twilioNumber} />
        
        <Alert>Choose "Always Forward" or "Forward When Busy/No Answer"</Alert>
      </Card>
      
      <Card>
        <h2>Step 3: Test Your Setup</h2>
        <p>Call your clinic number: {workspace.account.phone_number}</p>
        <p>You should hear your AI receptionist!</p>
        
        <Button onClick={() => testPhoneSetup()}>
          Test Now
        </Button>
      </Card>
      
      <Button onClick={() => router.push('configure-availability')}>
        Next: Configure When AI Answers
      </Button>
    </div>
  );
}

// Step 2B: Setup Number Porting
// Component: apps/web/app/home/[account]/phone-setup/setup-porting/page.tsx

export default async function SetupPortingPage() {
  return (
    <div>
      <h1>Port Your Phone Number</h1>
      
      <Alert type="info">
        Porting takes 7-14 business days. Your phone will continue working during this time.
      </Alert>
      
      <Form>
        <h2>Number to Port</h2>
        <Input
          label="Phone Number"
          name="phoneNumber"
          placeholder="+1-416-555-1234"
        />
        
        <h2>Current Provider Information</h2>
        <Select
          label="Current Carrier"
          name="carrier"
          options={['Bell', 'Rogers', 'Telus', 'Freedom', 'Other']}
        />
        
        <FileUpload
          label="Recent Phone Bill (PDF)"
          name="billPdf"
          accept=".pdf"
          required
        />
        
        <Alert>
          We need a copy of your most recent phone bill to verify ownership.
        </Alert>
        
        <Checkbox
          name="loa_signed"
          label="I authorize the transfer of my phone number"
          required
        />
        
        <Button type="submit">
          Submit Port Request
        </Button>
      </Form>
      
      <Timeline>
        <TimelineItem status="current">Submit port request</TimelineItem>
        <TimelineItem>Provider review (2-3 days)</TimelineItem>
        <TimelineItem>Port scheduled (7-14 days)</TimelineItem>
        <TimelineItem>Port complete - AI live!</TimelineItem>
      </Timeline>
    </div>
  );
}

// Step 2C: Setup SIP Integration
// Component: apps/web/app/home/[account]/phone-setup/setup-sip/page.tsx

export default async function SetupSIPPage() {
  const workspace = await loadTeamWorkspace();
  const sipUri = generateSIPUri(workspace.account.slug);
  
  return (
    <div>
      <h1>Connect Your Phone System (PBX)</h1>
      
      <Alert type="info">
        This option is best if you have RingCentral, 3CX, Mitel, or another business phone system.
      </Alert>
      
      <Card>
        <h2>Your SIP URI</h2>
        <p>Add this as a SIP destination in your phone system:</p>
        
        <CodeBlock large>{sipUri}</CodeBlock>
        <CopyButton text={sipUri} />
      </Card>
      
      <Card>
        <h2>Setup Instructions</h2>
        
        <Tabs>
          <Tab label="RingCentral">
            <ol>
              <li>Go to RingCentral Admin Portal</li>
              <li>Navigate to: Phone System → Auto-Receptionist</li>
              <li>Click "Add External Number"</li>
              <li>Paste SIP URI: <code>{sipUri}</code></li>
              <li>Set routing rule: "After Hours" → AI Receptionist</li>
              <li>Save changes</li>
            </ol>
            <Video src="/videos/ringcentral-setup.mp4" />
          </Tab>
          
          <Tab label="3CX">
            <ol>
              <li>Open 3CX Management Console</li>
              <li>Go to: Trunks → Add Trunk</li>
              <li>Select "SIP Trunk"</li>
              <li>Host: <code>parlae.sip.twilio.com</code></li>
              <li>Username: <code>{workspace.account.slug}</code></li>
              <li>Create inbound rule for after-hours</li>
              <li>Test the connection</li>
            </ol>
          </Tab>
          
          <Tab label="Other PBX">
            <GenericSIPInstructions sipUri={sipUri} />
          </Tab>
        </Tabs>
      </Card>
      
      <Card>
        <h2>Test Your Connection</h2>
        <Button onClick={() => testSIPConnection()}>
          Test SIP Connection
        </Button>
        
        <ConnectionStatus />
      </Card>
      
      <Button onClick={() => router.push('configure-availability')}>
        Next: Configure When AI Answers
      </Button>
    </div>
  );
}

// Step 3: Configure Availability
// Component: apps/web/app/home/[account]/phone-setup/configure-availability/page.tsx

export default function ConfigureAvailabilityPage() {
  const [mode, setMode] = useState<AvailabilityMode>('always');
  
  return (
    <div>
      <h1>When Should AI Answer?</h1>
      
      <RadioGroup value={mode} onChange={setMode}>
        <Radio value="always">
          <strong>Always</strong>
          <p>AI answers all calls 24/7</p>
        </Radio>
        
        <Radio value="after-hours-only">
          <strong>After-Hours Only</strong>
          <p>AI answers when clinic is closed</p>
          {mode === 'after-hours-only' && (
            <BusinessHoursEditor />
          )}
        </Radio>
        
        <Radio value="overflow-only">
          <strong>Overflow (When Busy)</strong>
          <p>AI answers when staff is busy or unavailable</p>
          {mode === 'overflow-only' && (
            <Input
              label="Max concurrent calls before AI"
              type="number"
              defaultValue={3}
            />
          )}
        </Radio>
        
        <Radio value="scheduled">
          <strong>Custom Schedule</strong>
          <p>Set specific times when AI should answer</p>
          {mode === 'scheduled' && (
            <ScheduleEditor />
          )}
        </Radio>
      </RadioGroup>
      
      <Card>
        <h2>What Happens When AI Doesn't Answer?</h2>
        
        <Select
          label="Fallback Action"
          options={[
            { value: 'voicemail', label: 'Send to voicemail' },
            { value: 'forward', label: 'Forward to staff phone' },
            { value: 'busy-signal', label: 'Play busy signal' }
          ]}
        />
        
        <Input
          label="Staff Forward Number (for emergencies)"
          placeholder="+1-416-555-5678"
          helper="AI will transfer urgent calls to this number"
        />
      </Card>
      
      <Button onClick={saveAndComplete}>
        Complete Setup
      </Button>
    </div>
  );
}

// Step 4: Setup Complete
// Component: apps/web/app/home/[account]/phone-setup/complete/page.tsx

export default function SetupCompletePage() {
  return (
    <div>
      <SuccessIcon />
      <h1>Phone Setup Complete!</h1>
      
      <Card>
        <h2>Your AI Receptionist is Live</h2>
        <p>Patients can now call: <strong>{clinicPhone}</strong></p>
        <p>And your AI receptionist will answer!</p>
      </Card>
      
      <Card>
        <h2>Test Your Setup</h2>
        <Button onClick={() => callTestNumber()}>
          Call Test Number
        </Button>
        
        <TestScript>
          <li>Say: "I need to book an appointment"</li>
          <li>AI will gather your information</li>
          <li>Say: "This is an emergency" to test transfer</li>
        </TestScript>
      </Card>
      
      <Card>
        <h2>Next Steps</h2>
        <ul>
          <li><Link href="dashboard">View call analytics</Link></li>
          <li><Link href="settings">Customize AI responses</Link></li>
          <li><Link href="availability">Adjust availability settings</Link></li>
        </ul>
      </Card>
      
      <Button onClick={() => router.push('dashboard')}>
        Go to Dashboard
      </Button>
    </div>
  );
}
```

### 3. Change Integration Method Later

```typescript
// Component: apps/web/app/home/[account]/phone-setup/change-method/page.tsx

export default function ChangeMethodPage() {
  const currentMethod = 'forwarded'; // From database
  
  return (
    <div>
      <h1>Change Integration Method</h1>
      
      <Alert type="info">
        Current method: <strong>Call Forwarding</strong>
      </Alert>
      
      <p>Want to upgrade to a better option?</p>
      
      <MethodCard
        title="Upgrade to Port Number"
        description="Get best call quality by porting your number"
        benefit="Better quality, more reliable"
        onClick={() => startPortingProcess()}
      />
      
      <MethodCard
        title="Switch to SIP Integration"
        description="Connect your PBX for flexible routing"
        benefit="After-hours only, overflow support"
        onClick={() => startSIPSetup()}
      />
      
      <Alert type="warning">
        Changing methods will require a brief setup period. Your current setup will continue working until the new method is active.
      </Alert>
    </div>
  );
}
```

### 4. Complete Webhook Implementation

See `VAPI_PHONE_INTEGRATION_IMPLEMENTATION.md` for full code.

Key endpoints:
- `/api/twilio/voice` - Handles all inbound calls
- `/api/twilio/sip` - Handles SIP trunk calls
- `/api/vapi/tools/transfer-to-human` - Handles emergency transfers
- `/api/twilio/conference-status` - Monitors conference calls

## Summary

✅ **Three Integration Methods** - Port, Forward, SIP  
✅ **Full Onboarding Wizard** - Step-by-step UI  
✅ **Change Methods Later** - Easy to upgrade  
✅ **Call Transfer to Human** - Fully supported  
✅ **Clinic Keeps Their Number** - Patients always dial the same number  
✅ **Flexible Routing** - Settings-based availability  

The system is designed to be flexible and allow clinics to start simple (forwarding) and upgrade to better options (SIP or porting) as they grow!
