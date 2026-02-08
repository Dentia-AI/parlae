# Vapi Production Squad Design

## Overview

This document outlines a flexible, production-ready squad architecture that supports:
- Multiple specialized assistants (receptionist, booking, emergency)
- Patient data retrieval
- Conditional routing (after-hours, high call volume)
- Transfer to human agents
- Outbound call capabilities
- Easy extensibility for future assistants

## Squad Architecture

### Core Assistants

Each clinic squad consists of these core assistants:

```
┌─────────────────────────────────────────────────────────────┐
│ CLINIC SQUAD                                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Receptionist (Entry Point)                             │
│     - Greets caller                                         │
│     - Answers general questions                             │
│     - Routes to appropriate specialist                      │
│     - Checks business hours                                 │
│                                                             │
│  2. Booking Agent                                           │
│     - Books appointments                                    │
│     - Retrieves patient history                             │
│     - Checks availability                                   │
│     - Confirms bookings                                     │
│                                                             │
│  3. Emergency Agent                                         │
│     - Handles urgent cases                                  │
│     - Books same-day appointments                           │
│     - Transfers to human if needed                          │
│                                                             │
│  4. After-Hours Agent (Optional)                            │
│     - Takes messages                                        │
│     - Books future appointments                             │
│     - Escalates true emergencies                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Implementation

### 1. Receptionist Assistant (Triage & Routing)

```typescript
const receptionistAssistant = {
  name: `${clinicName} - Receptionist`,
  firstMessage: `Hi, welcome to ${clinicName}! I'm ${assistantName}. How can I help you today?`,
  voice: {
    provider: '11labs',
    voiceId: 'rachel'
  },
  model: {
    provider: 'openai',
    model: 'gpt-4o',
    systemPrompt: `
CLINIC INFORMATION:
- Name: ${clinicName}
- Hours: ${businessHours}
- Location: ${address}
- Services: ${services.join(', ')}

You are ${assistantName}, the friendly receptionist at ${clinicName}.

BUSINESS HOURS CHECK:
- Current time: Use the checkBusinessHours tool to determine if we're open
- If AFTER HOURS → Transfer to After-Hours agent
- If OPEN → Continue with normal routing

ROUTING LOGIC:
1. EMERGENCY (severe pain, bleeding, trauma, swelling)
   → Transfer to Emergency agent
   
2. BOOKING/SCHEDULING (appointments, check-ups, cleanings)
   → Transfer to Booking agent
   
3. GENERAL QUESTIONS (hours, services, insurance, directions)
   → Answer directly using clinic information above

4. HIGH CALL VOLUME
   → If caller has been waiting, apologize and offer callback
   → Use requestCallback tool

Always be warm, empathetic, and professional.
    `,
    temperature: 0.7,
    maxTokens: 500
  },
  tools: [
    checkBusinessHoursTool,
    requestCallbackTool
  ],
  assistantDestinations: [
    {
      type: 'assistant',
      assistantName: `${clinicName} - After-Hours`,
      message: "I see we're currently closed. Let me connect you to our after-hours service.",
      description: 'When clinic is closed (checkBusinessHours returns false)'
    },
    {
      type: 'assistant',
      assistantName: `${clinicName} - Emergency`,
      message: 'I understand this is urgent. Let me connect you to our emergency team right away.',
      description: 'For severe pain, bleeding, broken teeth, facial trauma, or any dental emergency'
    },
    {
      type: 'assistant',
      assistantName: `${clinicName} - Booking`,
      message: 'Let me connect you with our booking specialist.',
      description: 'For scheduling appointments, checkups, cleanings, or any routine dental services'
    }
  ]
};
```

### 2. Booking Agent (Appointment Scheduling)

```typescript
const bookingAssistant = {
  name: `${clinicName} - Booking`,
  voice: {
    provider: '11labs',
    voiceId: 'rachel'
  },
  model: {
    provider: 'openai',
    model: 'gpt-4o',
    systemPrompt: `
CLINIC: ${clinicName}

You are the booking specialist for ${clinicName}.

PROCESS:
1. Get or verify patient information:
   - Use getPatientInfo tool with phone number or name
   - If existing patient, confirm: "I see you're in our system. Is this still your current phone/email?"
   - If new patient, collect: name, phone, email, date of birth

2. Determine service needed:
   - Cleaning/Checkup
   - Filling
   - Root Canal
   - Cosmetic (whitening, veneers)
   - Other

3. Check availability:
   - Use checkAvailability tool
   - Offer 2-3 specific time slots
   - Consider patient preferences (morning/afternoon/specific days)

4. Confirm booking:
   - Use bookAppointment tool with all details
   - Provide confirmation number
   - Confirm they'll receive SMS/email reminder
   - Ask if they need directions or have questions

PATIENT DATA HANDLING:
- Always verify identity before discussing medical history
- Use patient data to provide personalized service
- Example: "I see your last visit was 6 months ago for a cleaning. Are you due for your regular checkup?"

Be efficient but friendly. Make them feel valued.
    `,
    temperature: 0.7,
    maxTokens: 600
  },
  tools: [
    getPatientInfoTool,
    checkAvailabilityTool,
    bookAppointmentTool,
    updatePatientInfoTool
  ]
};
```

### 3. Emergency Agent (Urgent Cases + Transfer to Human)

```typescript
const emergencyAssistant = {
  name: `${clinicName} - Emergency`,
  voice: {
    provider: '11labs',
    voiceId: 'rachel'
  },
  model: {
    provider: 'openai',
    model: 'gpt-4o',
    systemPrompt: `
CLINIC: ${clinicName}
EMERGENCY HOTLINE: ${emergencyPhone}

You handle dental emergencies for ${clinicName} with care and urgency.

ASSESSMENT:
1. Gather key information:
   - Patient name and phone
   - Nature of emergency (pain/bleeding/trauma/swelling)
   - Pain level (1-10)
   - When did it start?
   - Any visible damage/bleeding?

2. Determine severity:
   
   LIFE-THREATENING (transfer to human immediately):
   - Severe uncontrolled bleeding
   - Difficulty breathing due to swelling
   - Jaw fracture
   - Loss of consciousness
   → Use transferToHuman tool immediately
   
   URGENT (same-day appointment):
   - Severe pain (8-10/10)
   - Knocked-out tooth
   - Broken tooth with sharp edges
   - Abscess/severe swelling
   → Use bookEmergencyAppointment tool
   
   CAN WAIT (next available):
   - Moderate pain (4-7/10)
   - Lost filling/crown
   - Mild sensitivity
   → Use checkAvailability for soonest slot

3. Provide first aid advice:
   - For knocked-out tooth: "Keep the tooth moist in milk or saliva"
   - For pain: "Take ibuprofen if not allergic"
   - For bleeding: "Apply gauze with gentle pressure"

4. Follow up:
   - Confirm appointment time
   - Provide clinic phone number
   - If transferred to human, ensure smooth handoff

Be calm, reassuring, and efficient. Every second counts in emergencies.
    `,
    temperature: 0.6, // Slightly lower for more consistent emergency handling
    maxTokens: 600
  },
  tools: [
    getPatientInfoTool,
    bookEmergencyAppointmentTool,
    transferToHumanTool, // Special tool for live agent transfer
    sendEmergencyAlertTool // Alerts clinic staff immediately
  ]
};
```

### 4. After-Hours Agent (Optional but Recommended)

```typescript
const afterHoursAssistant = {
  name: `${clinicName} - After-Hours`,
  firstMessage: `Thank you for calling ${clinicName}. We're currently closed, but I can help you! Is this an emergency or would you like to schedule an appointment?`,
  voice: {
    provider: '11labs',
    voiceId: 'rachel'
  },
  model: {
    provider: 'openai',
    model: 'gpt-4o',
    systemPrompt: `
CLINIC: ${clinicName}
HOURS: ${businessHours}
EMERGENCY HOTLINE: ${emergencyPhone}

We are currently CLOSED. Our hours are: ${businessHours}.

YOUR ROLE:
1. For EMERGENCIES:
   - Assess severity
   - If life-threatening → Provide emergency hotline or direct to ER
   - If urgent but not life-threatening → Take information and schedule earliest available (use bookAppointment with "urgent" flag)
   - Send alert to on-call staff via sendEmergencyAlert

2. For NON-EMERGENCIES:
   - Take detailed message (use leaveMessage tool)
   - Offer to schedule appointment for when we reopen
   - Confirm they'll receive confirmation via SMS/email
   - Provide our phone number and hours

3. For QUESTIONS:
   - Answer basic questions about services, insurance, location
   - For complex questions, take message for callback

Be understanding and helpful. Many after-hours calls are from people in pain.
    `,
    temperature: 0.7,
    maxTokens: 500
  },
  tools: [
    leaveMessageTool,
    bookAppointmentTool,
    sendEmergencyAlertTool
  ]
};
```

## Tool Definitions

### Core Tools for All Assistants

#### 1. Check Business Hours

```typescript
const checkBusinessHoursTool = {
  type: 'function',
  function: {
    name: 'checkBusinessHours',
    description: 'Check if the clinic is currently open based on business hours and current time',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'Clinic timezone (e.g., America/Los_Angeles)',
          default: clinicTimezone
        }
      }
    }
  },
  server: {
    url: `${webhookUrl}/api/vapi/tools/check-business-hours`,
    secret: webhookSecret,
    timeoutSeconds: 5
  }
};
```

#### 2. Get Patient Info (HIPAA-Compliant)

```typescript
const getPatientInfoTool = {
  type: 'function',
  function: {
    name: 'getPatientInfo',
    description: 'Retrieve patient information from clinic database. ONLY use after verifying identity.',
    parameters: {
      type: 'object',
      properties: {
        phoneNumber: {
          type: 'string',
          description: 'Patient phone number for lookup'
        },
        patientName: {
          type: 'string',
          description: 'Patient full name for verification'
        },
        dateOfBirth: {
          type: 'string',
          description: 'Date of birth for identity verification (YYYY-MM-DD)',
        }
      },
      required: ['phoneNumber']
    }
  },
  server: {
    url: `${webhookUrl}/api/vapi/tools/get-patient-info`,
    secret: webhookSecret,
    timeoutSeconds: 10
  },
  messages: [
    {
      type: 'request-start',
      content: 'Let me look up your information...'
    }
  ]
};
```

#### 3. Check Availability

```typescript
const checkAvailabilityTool = {
  type: 'function',
  function: {
    name: 'checkAvailability',
    description: 'Check available appointment slots for a specific service',
    parameters: {
      type: 'object',
      properties: {
        serviceType: {
          type: 'string',
          enum: ['cleaning', 'filling', 'root-canal', 'cosmetic', 'emergency', 'checkup', 'other'],
          description: 'Type of dental service needed'
        },
        preferredDate: {
          type: 'string',
          description: 'Preferred date in YYYY-MM-DD format (optional)'
        },
        preferredTimeOfDay: {
          type: 'string',
          enum: ['morning', 'afternoon', 'evening', 'any'],
          description: 'Preferred time of day'
        },
        durationMinutes: {
          type: 'number',
          description: 'Expected appointment duration in minutes',
          default: 60
        }
      },
      required: ['serviceType']
    }
  },
  server: {
    url: `${webhookUrl}/api/vapi/tools/check-availability`,
    secret: webhookSecret,
    timeoutSeconds: 15
  },
  messages: [
    {
      type: 'request-start',
      content: 'Let me check our calendar...'
    }
  ]
};
```

#### 4. Book Appointment

```typescript
const bookAppointmentTool = {
  type: 'function',
  function: {
    name: 'bookAppointment',
    description: 'Book a confirmed appointment after collecting all required information',
    parameters: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'Patient ID if existing patient'
        },
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
          description: 'Email address for confirmations'
        },
        dateOfBirth: {
          type: 'string',
          description: 'Date of birth (YYYY-MM-DD) for new patients'
        },
        serviceType: {
          type: 'string',
          description: 'Type of service being booked'
        },
        appointmentDate: {
          type: 'string',
          description: 'Appointment date (YYYY-MM-DD)'
        },
        appointmentTime: {
          type: 'string',
          description: 'Appointment time (HH:MM in 24-hour format)'
        },
        notes: {
          type: 'string',
          description: 'Any additional notes or patient requests'
        },
        isUrgent: {
          type: 'boolean',
          description: 'Mark as urgent for priority scheduling',
          default: false
        }
      },
      required: ['patientName', 'patientPhone', 'serviceType', 'appointmentDate', 'appointmentTime']
    }
  },
  server: {
    url: `${webhookUrl}/api/vapi/tools/book-appointment`,
    secret: webhookSecret,
    timeoutSeconds: 20
  },
  messages: [
    {
      type: 'request-start',
      content: 'Let me book that for you...'
    },
    {
      type: 'request-complete',
      content: 'Perfect! Your appointment is confirmed.'
    }
  ]
};
```

#### 5. Transfer to Human (Emergency)

```typescript
const transferToHumanTool = {
  type: 'function',
  function: {
    name: 'transferToHuman',
    description: 'Transfer call to a live human agent for life-threatening emergencies or complex issues',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: ['life-threatening', 'patient-request', 'technical-issue', 'escalation'],
          description: 'Reason for transfer'
        },
        summary: {
          type: 'string',
          description: 'Brief summary of the situation for the human agent'
        },
        patientInfo: {
          type: 'object',
          description: 'Patient information to pass to agent',
          properties: {
            name: { type: 'string' },
            phone: { type: 'string' },
            emergency: { type: 'string' }
          }
        }
      },
      required: ['reason', 'summary']
    }
  },
  server: {
    url: `${webhookUrl}/api/vapi/tools/transfer-to-human`,
    secret: webhookSecret,
    timeoutSeconds: 10
  },
  messages: [
    {
      type: 'request-start',
      content: 'Let me connect you to someone who can help right away...'
    }
  ]
};
```

#### 6. Request Callback (High Volume)

```typescript
const requestCallbackTool = {
  type: 'function',
  function: {
    name: 'requestCallback',
    description: 'Schedule a callback for the patient when call volume is high',
    parameters: {
      type: 'object',
      properties: {
        patientName: {
          type: 'string',
          description: 'Patient name'
        },
        patientPhone: {
          type: 'string',
          description: 'Phone number for callback'
        },
        preferredCallbackTime: {
          type: 'string',
          description: 'Preferred time for callback'
        },
        reason: {
          type: 'string',
          description: 'Brief reason for the call'
        }
      },
      required: ['patientName', 'patientPhone', 'reason']
    }
  },
  server: {
    url: `${webhookUrl}/api/vapi/tools/request-callback`,
    secret: webhookSecret,
    timeoutSeconds: 10
  }
};
```

## Adding New Assistants

To add a new assistant to an existing squad:

```typescript
// 1. Create the new assistant
const newAssistant = await vapiService.createAssistant({
  name: `${clinicName} - Insurance Specialist`,
  // ... configuration
});

// 2. Get existing squad
const squad = await vapiService.getSquad(squadId);

// 3. Update receptionist to add new destination
const receptionist = squad.members[0];
await vapiService.updateAssistant(receptionist.assistantId, {
  assistantDestinations: [
    ...receptionist.assistantDestinations,
    {
      type: 'assistant',
      assistantName: `${clinicName} - Insurance Specialist`,
      message: 'Let me connect you to our insurance specialist.',
      description: 'For insurance verification, pre-authorization, or billing questions'
    }
  ]
});

// 4. Add new assistant to squad (requires recreating squad)
// Note: Vapi doesn't support adding members to existing squads directly
// You need to recreate the squad with the new member
```

## Outbound Call Support

Vapi supports outbound calls via a separate API. Here's the structure:

```typescript
async function makeOutboundCall({
  clinicId,
  patientPhone,
  purpose, // 'appointment-reminder' | 'follow-up' | 'recall' | 'survey'
  appointmentDetails
}: OutboundCallParams) {
  
  // Select appropriate assistant based on purpose
  const assistantId = getOutboundAssistantId(clinicId, purpose);
  
  // Create outbound call
  const call = await vapiService.createCall({
    assistantId,
    customer: {
      number: patientPhone
    },
    phoneNumberId: clinicPhoneNumberId,
    // Pass context for personalization
    assistantOverrides: {
      variableValues: {
        patientName: appointmentDetails.patientName,
        appointmentDate: appointmentDetails.date,
        appointmentTime: appointmentDetails.time,
        serviceName: appointmentDetails.service
      }
    }
  });
  
  return call;
}
```

### Outbound Assistant Example

```typescript
const appointmentReminderAssistant = {
  name: `${clinicName} - Appointment Reminder`,
  firstMessage: `Hi {{patientName}}, this is ${assistantName} calling from ${clinicName}. I'm calling to remind you about your {{serviceName}} appointment tomorrow at {{appointmentTime}}. Will you be able to make it?`,
  model: {
    systemPrompt: `
You are making an outbound call to remind a patient about their appointment.

APPOINTMENT DETAILS:
- Patient: {{patientName}}
- Service: {{serviceName}}
- Date: {{appointmentDate}}
- Time: {{appointmentTime}}

YOUR GOALS:
1. Confirm they can make the appointment
2. If they can't, offer to reschedule
3. Answer any questions they have
4. Keep call brief and friendly

If they confirm:
- Thank them and say "We'll see you tomorrow!"
- Use confirmAppointment tool

If they need to reschedule:
- Use rescheduleAppointment tool
- Offer 2-3 alternative times

If no answer/voicemail:
- Leave brief message with callback number
    `
  },
  tools: [
    confirmAppointmentTool,
    rescheduleAppointmentTool
  ]
};
```

## Conditional Routing Examples

### Business Hours Routing

```typescript
// In Receptionist system prompt:
`
FIRST ACTION: Always call checkBusinessHours tool immediately.

If closed (isOpen = false):
- Say: "I see we're currently closed. Our hours are ${businessHours}."
- Ask if it's an emergency
- If emergency → Transfer to After-Hours agent
- If not → Transfer to After-Hours agent for scheduling

If open (isOpen = true):
- Proceed with normal greeting and routing
`
```

### High Call Volume Handling

```typescript
// In webhook for checkBusinessHours tool:
export async function checkBusinessHours(clinicId: string) {
  const now = new Date();
  const clinic = await getClinic(clinicId);
  
  // Check if clinic is open
  const isOpen = isWithinBusinessHours(now, clinic.businessHours);
  
  // Check current call volume
  const activeCallsCount = await getActiveCallsCount(clinicId);
  const isHighVolume = activeCallsCount > clinic.maxConcurrentCalls;
  
  return {
    isOpen,
    isHighVolume,
    estimatedWaitMinutes: isHighVolume ? estimateWaitTime(activeCallsCount) : 0,
    officeHours: clinic.businessHours,
    message: isHighVolume 
      ? `We're experiencing higher than normal call volume. Your estimated wait time is ${estimateWaitTime(activeCallsCount)} minutes. Would you like to schedule a callback instead?`
      : null
  };
}
```

## Best Practices

### 1. Assistant Specialization
- ✅ Keep each assistant focused on one primary task
- ✅ Use clear, specific destination descriptions
- ✅ Limit to 4-5 assistants per squad maximum

### 2. Tool Design
- ✅ Tools should be fast (<10s timeout)
- ✅ Return user-friendly messages
- ✅ Handle errors gracefully
- ✅ Always include request-start messages for UX

### 3. Patient Data Security
- ✅ Verify identity before retrieving patient data
- ✅ Log all data access for HIPAA compliance
- ✅ Never include PHI in system prompts
- ✅ Use encrypted webhook endpoints

### 4. Transfer to Human
- ✅ Always provide context to human agent
- ✅ Test transfer functionality regularly
- ✅ Have fallback phone number if transfer fails
- ✅ Log all transfer attempts

### 5. Scaling Considerations
- ✅ Monitor call volume and wait times
- ✅ Add callback options during peak hours
- ✅ Consider multiple phone lines for large clinics
- ✅ Use analytics to optimize routing logic

## Next Steps

1. ✅ Implement core squad structure
2. ✅ Add patient data retrieval tools
3. ✅ Test emergency transfer to human
4. ✅ Implement business hours checking
5. ✅ Add after-hours handling
6. ✅ Build outbound call system
7. ✅ Monitor and optimize based on real call data

---

**Related Documentation:**
- [VAPI_ARCHITECTURE.md](./VAPI_ARCHITECTURE.md) - Architecture overview
- [VAPI_PER_CLINIC_IMPLEMENTATION.md](./VAPI_PER_CLINIC_IMPLEMENTATION.md) - Setup guide
- [VAPI_TESTING_GUIDE.md](./VAPI_TESTING_GUIDE.md) - Testing strategies
