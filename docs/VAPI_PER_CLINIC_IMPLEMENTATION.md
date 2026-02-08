# Vapi Per-Clinic Squad Implementation Guide

## Overview

This guide shows how to implement the per-clinic squad architecture where each clinic gets their own dedicated squad with personalized branding and context.

## Benefits

- ✅ **Zero latency** - All clinic data injected into prompts
- ✅ **Personalized greeting** - "Welcome to Smile Dental!" (not generic)
- ✅ **Organized folders** - Each clinic's assistants in their own Vapi folder
- ✅ **Simpler webhook** - No need to fetch clinic context during calls
- ✅ **Better UX** - Professional, branded experience
- ✅ **Easy updates** - Bulk update via API when needed

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ VAPI DASHBOARD (Organized by Folders)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📁 Clinic: Smile Dental (clinic_123)                      │
│    ├─ Squad: Smile Dental Squad                            │
│    ├─ Assistant: Smile Dental - Triage                     │
│    ├─ Assistant: Smile Dental - Emergency                  │
│    └─ Assistant: Smile Dental - Scheduler                  │
│                                                             │
│  📁 Clinic: Downtown Dentistry (clinic_456)                │
│    ├─ Squad: Downtown Dentistry Squad                      │
│    ├─ Assistant: Downtown Dentistry - Triage              │
│    ├─ Assistant: Downtown Dentistry - Emergency           │
│    └─ Assistant: Downtown Dentistry - Scheduler           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

Update `vapi_phone_numbers` table to include folder tracking:

```sql
-- Add folder tracking to vapi_phone_numbers
ALTER TABLE public.vapi_phone_numbers
ADD COLUMN vapi_folder_id TEXT;

CREATE INDEX idx_vapi_phone_numbers_folder 
ON public.vapi_phone_numbers(vapi_folder_id);
```

## Implementation Steps

### Step 1: Setup Clinic Squad Function

Create a server action to set up a complete clinic squad with folder organization:

```typescript
// apps/frontend/packages/shared/src/vapi/setup-clinic-squad.ts
'use server';

import { createVapiService } from '@kit/shared/vapi/server';
import { getLogger } from '@kit/shared/logger';

interface ClinicData {
  id: string;
  name: string;
  businessHours: string;
  address: string;
  phone: string;
  services: string[];
  insuranceAccepted: string[];
  pricingInfo?: string;
}

export async function setupClinicSquad(
  clinicData: ClinicData,
  phoneNumber: string,
  twilioAccountSid: string,
  twilioAuthToken: string
) {
  const logger = await getLogger();
  const vapiService = createVapiService();

  try {
    logger.info({ clinicId: clinicData.id, clinicName: clinicData.name }, 
      '[Vapi] Setting up clinic squad');

    // 1. Create folder for this clinic
    const folder = await vapiService.createFolder(
      `Clinic: ${clinicData.name} (${clinicData.id})`
    );

    if (!folder) {
      throw new Error('Failed to create Vapi folder');
    }

    logger.info({ folderId: folder.id }, '[Vapi] Created clinic folder');

    // 2. Define clinic context for prompts
    const clinicContext = `
CLINIC INFORMATION:
- Name: ${clinicData.name}
- Hours: ${clinicData.businessHours}
- Location: ${clinicData.address}
- Phone: ${clinicData.phone}
- Services: ${clinicData.services.join(', ')}
- Insurance: ${clinicData.insuranceAccepted.join(', ')}
${clinicData.pricingInfo ? `- Pricing: ${clinicData.pricingInfo}` : ''}
    `.trim();

    // 3. Define tools (shared across all assistants)
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/vapi/webhook`;
    const webhookSecret = process.env.VAPI_WEBHOOK_SECRET;

    const checkAvailabilityTool = {
      type: 'function' as const,
      function: {
        name: 'checkAvailability',
        description: 'Check available appointment slots for a specific service type',
        parameters: {
          type: 'object' as const,
          properties: {
            serviceType: {
              type: 'string',
              enum: ['cleaning', 'filling', 'root-canal', 'cosmetic', 'emergency', 'other'],
              description: 'Type of dental service needed'
            },
            preferredDate: {
              type: 'string',
              description: 'Preferred date in YYYY-MM-DD format (optional)'
            }
          },
          required: ['serviceType']
        }
      },
      server: {
        url: webhookUrl,
        secret: webhookSecret,
        timeoutSeconds: 15
      },
      messages: [
        {
          type: 'request-start' as const,
          content: 'Let me check our calendar...'
        }
      ]
    };

    const bookAppointmentTool = {
      type: 'function' as const,
      function: {
        name: 'bookAppointment',
        description: 'Book a confirmed appointment after collecting all patient details',
        parameters: {
          type: 'object' as const,
          properties: {
            patientName: {
              type: 'string',
              description: 'Patient full name'
            },
            patientPhone: {
              type: 'string',
              description: 'Contact phone number'
            },
            patientEmail: {
              type: 'string',
              description: 'Email address (optional)'
            },
            serviceType: {
              type: 'string',
              description: 'Type of service (cleaning, filling, etc.)'
            },
            appointmentDate: {
              type: 'string',
              description: 'Appointment date in YYYY-MM-DD format'
            },
            appointmentTime: {
              type: 'string',
              description: 'Appointment time in HH:MM format'
            }
          },
          required: ['patientName', 'patientPhone', 'serviceType', 'appointmentDate', 'appointmentTime']
        }
      },
      server: {
        url: webhookUrl,
        secret: webhookSecret,
        timeoutSeconds: 20
      },
      messages: [
        {
          type: 'request-start' as const,
          content: 'Let me book that for you...'
        },
        {
          type: 'request-complete' as const,
          content: 'Great! Your appointment is confirmed.'
        }
      ]
    };

    const bookEmergencyAppointmentTool = {
      type: 'function' as const,
      function: {
        name: 'bookEmergencyAppointment',
        description: 'Book a same-day emergency dental appointment',
        parameters: {
          type: 'object' as const,
          properties: {
            patientName: {
              type: 'string',
              description: 'Patient full name'
            },
            patientPhone: {
              type: 'string',
              description: 'Contact phone number'
            },
            emergencyType: {
              type: 'string',
              description: 'Description of the emergency (pain, bleeding, trauma, etc.)'
            },
            painLevel: {
              type: 'number',
              description: 'Pain level from 1-10'
            }
          },
          required: ['patientName', 'patientPhone', 'emergencyType']
        }
      },
      server: {
        url: webhookUrl,
        secret: webhookSecret,
        timeoutSeconds: 15
      },
      messages: [
        {
          type: 'request-start' as const,
          content: 'I understand this is urgent. Let me find you the earliest available time...'
        },
        {
          type: 'request-complete' as const,
          content: 'I have you scheduled. We\'ll see you soon.'
        }
      ]
    };

    // 4. Create squad with all members
    const squad = await vapiService.createSquad({
      name: `${clinicData.name} Squad`,
      folderId: folder.id,
      members: [
        {
          // TRIAGE ASSISTANT - First contact
          assistant: {
            name: `${clinicData.name} - Triage`,
            folderId: folder.id,
            firstMessage: `Hi, welcome to ${clinicData.name}! I'm Riley. How can I help you today?`,
            firstMessageMode: 'assistant-speaks-first',
            voice: {
              provider: '11labs',
              voiceId: 'rachel' // Use appropriate voice ID
            },
            model: {
              provider: 'openai',
              model: 'gpt-4o',
              systemPrompt: `
${clinicContext}

You are Riley, the friendly front desk assistant at ${clinicData.name}.

YOUR ROLE:
- Greet callers warmly and professionally
- Answer general questions about our services, hours, location, and insurance
- Assess the caller's needs and route appropriately

ROUTING RULES:
- For EMERGENCIES (severe pain, bleeding, broken teeth, facial trauma) → Transfer to Emergency assistant
- For APPOINTMENTS (booking, scheduling, rescheduling) → Transfer to Scheduler assistant  
- For GENERAL QUESTIONS (hours, services, insurance, directions) → Answer directly using the clinic information above

Be warm, empathetic, and helpful. Always confirm you understand their needs before transferring.
              `.trim(),
              temperature: 0.7,
              maxTokens: 500
            },
            recordingEnabled: true,
            endCallFunctionEnabled: true,
            serverUrl: webhookUrl,
            serverUrlSecret: webhookSecret,
            assistantDestinations: [
              {
                type: 'assistant',
                assistantName: `${clinicData.name} - Emergency`,
                message: 'I understand this is urgent. Let me connect you to our emergency team right away.',
                description: 'For severe pain, bleeding, broken teeth, facial swelling, or any dental trauma requiring immediate same-day care'
              },
              {
                type: 'assistant',
                assistantName: `${clinicData.name} - Scheduler`,
                message: 'Let me connect you with our scheduler to book your appointment.',
                description: 'For booking routine appointments like cleanings, checkups, fillings, root canals, or cosmetic procedures'
              }
            ]
          }
        },
        {
          // EMERGENCY ASSISTANT - Urgent cases
          assistant: {
            name: `${clinicData.name} - Emergency`,
            folderId: folder.id,
            voice: {
              provider: '11labs',
              voiceId: 'rachel'
            },
            model: {
              provider: 'openai',
              model: 'gpt-4o',
              systemPrompt: `
${clinicContext}

You handle dental emergencies for ${clinicData.name} with care and urgency.

YOUR PROCESS:
1. Stay calm and reassuring - the patient is likely in pain or distress
2. Gather essential information:
   - Patient name
   - Phone number
   - Description of the emergency
   - Pain level (1-10 scale)
3. Use the bookEmergencyAppointment tool to secure a same-day appointment
4. Provide clear instructions on what to do until their appointment
5. If life-threatening (severe uncontrolled bleeding, facial swelling affecting breathing, jaw fracture):
   - Direct them to the nearest ER immediately
   - Still offer to schedule a follow-up appointment

IMPORTANT:
- Be empathetic but efficient
- Prioritize getting them seen today
- Always collect patient name and phone number before booking
- Confirm the appointment time clearly
              `.trim(),
              temperature: 0.7,
              maxTokens: 500
            },
            tools: [bookEmergencyAppointmentTool],
            recordingEnabled: true,
            endCallFunctionEnabled: true,
            serverUrl: webhookUrl,
            serverUrlSecret: webhookSecret
          }
        },
        {
          // SCHEDULER ASSISTANT - Routine appointments
          assistant: {
            name: `${clinicData.name} - Scheduler`,
            folderId: folder.id,
            voice: {
              provider: '11labs',
              voiceId: 'rachel'
            },
            model: {
              provider: 'openai',
              model: 'gpt-4o',
              systemPrompt: `
${clinicContext}

You help patients book routine dental appointments at ${clinicData.name}.

YOUR PROCESS:
1. Get patient name
2. Get phone number (and email if they'd like reminders)
3. Ask what service they need:
   - Cleaning/Checkup
   - Filling
   - Root Canal
   - Cosmetic (whitening, veneers)
   - Other
4. Use checkAvailability tool to find open appointment slots
5. Offer 2-3 specific date and time options
6. Once they choose, use bookAppointment tool to confirm
7. Provide confirmation number and appointment details

IMPORTANT RULES:
- Always collect ALL required information before calling bookAppointment
- Confirm all details: "Just to confirm, that's [name] at [phone] for a [service] on [date] at [time]. Is that correct?"
- Be friendly, patient, and accommodating
- If they need to reschedule, help them find a new time
- Offer appointment reminders if they provide an email

Be conversational and helpful - this is a routine call, so keep it pleasant!
              `.trim(),
              temperature: 0.7,
              maxTokens: 500
            },
            tools: [checkAvailabilityTool, bookAppointmentTool],
            recordingEnabled: true,
            endCallFunctionEnabled: true,
            serverUrl: webhookUrl,
            serverUrlSecret: webhookSecret
          }
        }
      ]
    });

    if (!squad) {
      throw new Error('Failed to create Vapi squad');
    }

    logger.info({ squadId: squad.id }, '[Vapi] Created clinic squad');

    // 5. Import phone number and link to squad
    const vapiPhone = await vapiService.importPhoneNumber(
      phoneNumber,
      twilioAccountSid,
      twilioAuthToken,
      squad.id,
      true // isSquad
    );

    if (!vapiPhone) {
      throw new Error('Failed to import phone number to Vapi');
    }

    logger.info({ 
      phoneNumber: vapiPhone.number,
      vapiPhoneId: vapiPhone.id 
    }, '[Vapi] Imported phone number');

    // 6. Return all IDs for database storage
    return {
      success: true,
      folderId: folder.id,
      squadId: squad.id,
      vapiPhoneId: vapiPhone.id,
      phoneNumber: vapiPhone.number
    };

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : error,
      clinicId: clinicData.id
    }, '[Vapi] Failed to setup clinic squad');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

### Step 2: Store Clinic Squad in Database

After creating the squad, save the IDs to your database:

```typescript
// After calling setupClinicSquad
const result = await setupClinicSquad(clinicData, phoneNumber, twilioSid, twilioToken);

if (result.success) {
  // Save to database
  await db.vapiPhoneNumber.create({
    data: {
      account_id: clinicData.id,
      phone_number: result.phoneNumber,
      vapi_phone_id: result.vapiPhoneId,
      vapi_squad_id: result.squadId,
      vapi_folder_id: result.folderId,
      friendly_name: `${clinicData.name} Main Line`,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    }
  });
}
```

### Step 3: Update Clinic Squad

When clinic information changes, update the squad:

```typescript
// apps/frontend/packages/shared/src/vapi/update-clinic-squad.ts
'use server';

import { createVapiService } from '@kit/shared/vapi/server';
import { getLogger } from '@kit/shared/logger';

export async function updateClinicSquad(
  clinicId: string,
  updatedClinicData: ClinicData
) {
  const logger = await getLogger();
  const vapiService = createVapiService();

  try {
    // Get the clinic's phone record from database
    const phoneRecord = await db.vapiPhoneNumber.findFirst({
      where: { account_id: clinicId }
    });

    if (!phoneRecord) {
      throw new Error('Clinic phone number not found');
    }

    // Get the squad from Vapi
    const squad = await vapiService.getSquad(phoneRecord.vapi_squad_id);
    
    if (!squad) {
      throw new Error('Squad not found in Vapi');
    }

    // Update each assistant in the squad
    // Note: This requires updating each assistant individually
    // Vapi doesn't support bulk squad member updates yet
    
    for (const member of squad.members) {
      if (member.assistant) {
        // Regenerate the system prompt with new clinic data
        const updatedPrompt = generateSystemPrompt(
          member.assistant.name, 
          updatedClinicData
        );
        
        await vapiService.updateAssistant(member.assistant.id, {
          model: {
            systemPrompt: updatedPrompt
          }
        });
      }
    }

    logger.info({ clinicId, squadId: squad.id }, 
      '[Vapi] Updated clinic squad');

    return { success: true };
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : error,
      clinicId
    }, '[Vapi] Failed to update clinic squad');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

### Step 4: Bulk Update All Squads

When you need to update behavior across all clinics:

```typescript
// Update all clinics with new triage logic
export async function updateAllClinicSquads(
  updateType: 'triage' | 'emergency' | 'scheduler',
  newPromptTemplate: string
) {
  const logger = await getLogger();
  
  // Get all active clinic phone numbers
  const phoneRecords = await db.vapiPhoneNumber.findMany({
    where: { status: 'active' },
    include: { account: true }
  });

  logger.info({ count: phoneRecords.length }, 
    '[Vapi] Starting bulk squad update');

  const results = await Promise.allSettled(
    phoneRecords.map(async (record) => {
      // Get squad and update specific assistant
      const squad = await vapiService.getSquad(record.vapi_squad_id);
      
      // Find the assistant to update
      const assistantToUpdate = squad.members.find(m => 
        m.assistant.name.includes(updateType)
      );

      if (assistantToUpdate) {
        // Generate new prompt with clinic context
        const newPrompt = newPromptTemplate.replace(
          '{{CLINIC_CONTEXT}}',
          generateClinicContext(record.account)
        );

        return vapiService.updateAssistant(assistantToUpdate.assistant.id, {
          model: { systemPrompt: newPrompt }
        });
      }
    })
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  logger.info({ successful, failed }, 
    '[Vapi] Completed bulk squad update');

  return { successful, failed };
}
```

## Webhook Implementation

The webhook handles tool calls from all clinics. Use `phoneNumberId` to identify the clinic:

```typescript
// apps/frontend/apps/web/app/api/vapi/webhook/route.ts
import { NextResponse } from 'next/server';
import { getLogger } from '@kit/shared/logger';

export async function POST(request: Request) {
  const logger = await getLogger();
  const payload = await request.json();

  // Verify webhook secret
  const signature = request.headers.get('x-vapi-signature');
  if (signature !== process.env.VAPI_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const { call, message } = payload;
  const phoneNumberId = call.phoneNumberId;

  // Handle function calls
  if (message.type === 'function-call') {
    const { functionCall } = message;

    // Get clinic from phone number
    const phoneRecord = await db.vapiPhoneNumber.findUnique({
      where: { vapi_phone_id: phoneNumberId },
      include: { account: true }
    });

    if (!phoneRecord) {
      return NextResponse.json({
        error: 'Phone number not found'
      });
    }

    const clinic = phoneRecord.account;

    // Handle different tool calls
    switch (functionCall.name) {
      case 'checkAvailability':
        const availability = await checkClinicAvailability(
          clinic.id,
          functionCall.parameters.serviceType,
          functionCall.parameters.preferredDate
        );

        return NextResponse.json({
          result: {
            availableSlots: availability.slots,
            message: `We have availability on ${availability.dates.join(', ')}`
          }
        });

      case 'bookAppointment':
        const appointment = await bookClinicAppointment(
          clinic.id,
          functionCall.parameters
        );

        return NextResponse.json({
          result: {
            success: true,
            confirmationNumber: appointment.confirmationNumber,
            appointmentDate: appointment.date,
            appointmentTime: appointment.time,
            message: `Your appointment is confirmed for ${appointment.date} at ${appointment.time}`
          }
        });

      case 'bookEmergencyAppointment':
        const emergency = await bookEmergencyAppointment(
          clinic.id,
          functionCall.parameters
        );

        return NextResponse.json({
          result: {
            success: true,
            appointmentTime: emergency.time,
            message: `We'll see you today at ${emergency.time}. Please arrive 10 minutes early.`
          }
        });

      default:
        return NextResponse.json({
          error: 'Unknown function'
        });
    }
  }

  // Handle other events (call started, ended, etc.)
  if (message.type === 'end-of-call-report') {
    // Log call for analytics
    await db.vapiCallLog.create({
      data: {
        account_id: phoneRecord.account_id,
        call_id: call.id,
        phone_number_id: phoneNumberId,
        duration_seconds: message.endedReason.durationSeconds,
        transcript: message.transcript,
        recording_url: message.recordingUrl,
        analysis: message.analysis,
        ended_reason: message.endedReason.reason,
        created_at: new Date()
      }
    });
  }

  return NextResponse.json({ received: true });
}
```

## Testing

### Test Individual Clinic Setup

```typescript
// Test setting up one clinic
const testClinic: ClinicData = {
  id: 'test_clinic_123',
  name: 'Test Dental Clinic',
  businessHours: 'Mon-Fri 9am-6pm',
  address: '123 Main St, San Francisco, CA',
  phone: '+1-415-555-1234',
  services: ['Cleanings', 'Fillings', 'Root Canals'],
  insuranceAccepted: ['BlueCross', 'Aetna'],
  pricingInfo: 'Cleanings start at $150'
};

const result = await setupClinicSquad(
  testClinic,
  '+14155551234',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN'
);

console.log('Setup result:', result);
```

### Test Calling the Number

1. Call the phone number
2. Verify greeting: "Hi, welcome to Test Dental Clinic!"
3. Test routing:
   - Say "I have severe pain" → Should route to Emergency
   - Say "I need a cleaning" → Should route to Scheduler
4. Test tool calls:
   - Complete booking flow
   - Verify appointment is created in your system

## Best Practices

### Folder Naming

Use consistent folder naming:
```typescript
`Clinic: ${clinicName} (${clinicId})`
```

This makes it easy to:
- Find clinics in Vapi dashboard
- Map folders back to your database
- Debug issues

### Voice Selection

Choose appropriate voices for your brand:
- `rachel` - Professional, friendly female voice
- `josh` - Calm, professional male voice
- `bella` - Warm, conversational female voice

### System Prompt Design

- ✅ Include all clinic context at the top
- ✅ Use clear section headers (YOUR ROLE, PROCESS, RULES)
- ✅ Be specific about when to transfer
- ✅ Include examples for complex scenarios
- ✅ Keep prompts focused (one role per assistant)

### Tool Design

- ✅ Clear function names (`bookAppointment`, not `book`)
- ✅ Detailed parameter descriptions
- ✅ Required vs optional parameters
- ✅ User-friendly messages for tool execution
- ✅ Timeouts appropriate for your API (10-20s)

## Monitoring & Maintenance

### Track Squad Health

```typescript
// Check if all clinics have active squads
export async function auditClinicSquads() {
  const clinics = await db.account.findMany({
    where: { type: 'clinic' },
    include: { vapiPhoneNumbers: true }
  });

  const issues = [];

  for (const clinic of clinics) {
    if (clinic.vapiPhoneNumbers.length === 0) {
      issues.push({
        clinicId: clinic.id,
        issue: 'No phone number configured'
      });
    }

    for (const phone of clinic.vapiPhoneNumbers) {
      // Check if squad exists in Vapi
      const squad = await vapiService.getSquad(phone.vapi_squad_id);
      if (!squad) {
        issues.push({
          clinicId: clinic.id,
          phoneNumber: phone.phone_number,
          issue: 'Squad not found in Vapi'
        });
      }
    }
  }

  return issues;
}
```

### Clean Up Old Folders

```typescript
// Remove folders for deleted clinics
export async function cleanupVapiFolders() {
  const vapiService = createVapiService();
  
  // Get all folders from Vapi
  const vapiFolders = await vapiService.listFolders();
  
  // Get all active clinic IDs
  const activeClinicIds = await db.account.findMany({
    where: { type: 'clinic', status: 'active' },
    select: { id: true }
  }).then(clinics => clinics.map(c => c.id));

  // Find folders for deleted clinics
  const foldersToDelete = vapiFolders.filter(folder => {
    const clinicIdMatch = folder.name.match(/\(([^)]+)\)$/);
    if (!clinicIdMatch) return false;
    
    const clinicId = clinicIdMatch[1];
    return !activeClinicIds.includes(clinicId);
  });

  // Delete orphaned folders
  for (const folder of foldersToDelete) {
    await vapiService.deleteFolder(folder.id);
  }

  return { deleted: foldersToDelete.length };
}
```

## Next Steps

1. ✅ Implement `setupClinicSquad` function
2. ✅ Add folder tracking to database
3. ✅ Build webhook handler for tools
4. ✅ Test with one clinic
5. ✅ Add monitoring and alerts
6. ✅ Build admin UI for managing squads
7. ✅ Document clinic-specific customization options

## Related Documentation

- [VAPI_ARCHITECTURE.md](./VAPI_ARCHITECTURE.md) - Architecture overview
- [VAPI_TESTING_GUIDE.md](./VAPI_TESTING_GUIDE.md) - Testing strategies
- [VAPI_ADVANCED_FEATURES.md](./VAPI_ADVANCED_FEATURES.md) - Advanced features
