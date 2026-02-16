# Call Forwarding Setup Guide

## Overview

Call forwarding is the simplest and fastest way to connect Parlae's AI receptionist to a clinic's existing phone system. The clinic keeps their current phone number and forwards calls to a Twilio number managed by Parlae, where the AI handles them.

## How It Works

```
Patient calls clinic's main number
        ↓
Clinic's carrier forwards call to Parlae/Twilio number
        ↓
Vapi receives the call (caller ID is preserved)
        ↓
AI squad handles the call (or transfers to staff based on rules)
```

**Key benefit**: The patient's original caller ID (phone number) is preserved through the forwarding chain. Vapi receives it as `call.customer.number` in E.164 format (e.g., `+14165559876`), enabling automatic patient lookup by phone number.

## Recommended Setup: No-Answer + Busy Forwarding

The recommended configuration combines **no-answer** and **busy** forwarding. This provides the best experience:

| Scenario | What Happens |
|---|---|
| During hours, staff answers | Call handled by staff (no forwarding) |
| During hours, staff busy | Call forwards to AI |
| During hours, staff doesn't pick up | Call forwards to AI after ~15-25 seconds |
| After hours, nobody answers | Call forwards to AI |

This means the clinic doesn't need to toggle forwarding on/off — it just works automatically.

## Carrier-Specific Instructions

### Canadian Carriers (Bell, Rogers, Telus, Fido, Koodo, Virgin)

#### No-Answer Forwarding (Recommended)
Forwards calls to AI when nobody answers within ~15-25 seconds:
1. Pick up the clinic phone
2. Dial `*92` then the Twilio number (e.g., `*924161234567`)
3. Wait for confirmation tone
4. Hang up

**To disable**: Dial `*93`

#### Busy Forwarding (Recommended — stack with No-Answer)
Forwards calls to AI when the clinic line is busy:
1. Pick up the clinic phone
2. Dial `*90` then the Twilio number (e.g., `*904161234567`)
3. Wait for confirmation tone
4. Hang up

**To disable**: Dial `*91`

#### Unconditional Forwarding (All calls go to AI)
Use this if the clinic wants ALL calls handled by AI (e.g., after-hours only mode):
1. Pick up the clinic phone
2. Dial `*72` then the Twilio number (e.g., `*724161234567`)
3. Wait for confirmation tone
4. Hang up

**To disable**: Dial `*73`

### US Carriers (AT&T, Verizon, T-Mobile)

#### No-Answer Forwarding
1. Dial `*61*` then the Twilio number followed by `#` (e.g., `*61*14161234567#`)
2. Wait for confirmation

**To disable**: Dial `#61#`

#### Busy Forwarding
1. Dial `*67*` then the Twilio number followed by `#` (e.g., `*67*14161234567#`)
2. Wait for confirmation

**To disable**: Dial `#67#`

#### Unconditional Forwarding
1. Dial `*21*` then the Twilio number followed by `#` (e.g., `*21*14161234567#`)
2. Wait for confirmation

**To disable**: Dial `#21#`

### VoIP / PBX Systems (RingCentral, 8x8, Vonage, Grasshopper, etc.)

1. Log into your VoIP admin portal
2. Navigate to **Call Routing** or **Call Forwarding** settings
3. Add the Twilio number as a forwarding destination
4. Configure rules:
   - **No-answer**: Forward after X rings (typically 15-25 seconds)
   - **Busy**: Forward when all lines are occupied
   - **After hours**: Many VoIP systems have built-in time-based routing
5. Save and test with a test call

### Landline (Traditional Carrier)

Contact your phone provider and request:
- **No-answer call forwarding** to [Twilio number]
- **Busy call forwarding** to [Twilio number]

Most traditional carriers support these features. There may be a small monthly fee ($3-5/month).

## Emergency Transfer (Human Handoff)

When the AI detects an urgent situation (severe pain, emergencies, complex requests), it can **transfer the call directly to the clinic's staff**. This is done via Vapi's `transferCall` feature, which places a direct outbound call via Twilio to the clinic's number.

**Important**: The `transferCall` is a direct PSTN call — it does NOT go through the clinic's forwarding rules. It rings the clinic's phone directly, so there is no loop back to the AI.

### How It Works
1. Patient calls clinic → forwarded to AI
2. AI detects emergency or urgent situation
3. AI says: "Let me connect you with our clinic team right away"
4. `transferCall` places a direct call to the clinic's staff number
5. Patient is connected to a human

### Staff Direct Number
For clinics using **unconditional forwarding** (where all calls go to AI), the clinic should provide a **direct staff line** (cell phone, back office line) that doesn't have forwarding enabled. This prevents a loop where the AI transfers to the clinic, which forwards back to the AI.

For clinics using **no-answer/busy forwarding**, the main clinic number works fine for transfers — if staff are available, they'll answer the direct call from Twilio before the no-answer timer kicks in.

## Patient Caller ID

The patient's real phone number is preserved through the forwarding chain:
- Vapi receives it as `call.customer.number` in E.164 format
- The AI uses it automatically for:
  - Patient lookup (`searchPatients` by phone number)
  - Call logging and analytics
  - Callback scheduling
- **Exception**: If a patient calls from a blocked/private number, caller ID won't be available. The AI falls back to asking for the patient's name or phone number.

## Troubleshooting

| Issue | Solution |
|---|---|
| Calls not forwarding | Verify forwarding is active: dial `*#21#` (unconditional) or `*#61#` (no-answer) to check status |
| AI doesn't get caller ID | Patient may be calling from a blocked number. This is expected behavior. |
| Transfer to staff creates a loop | The clinic is using unconditional forwarding. Either switch to no-answer/busy forwarding, or provide a direct staff line that doesn't have forwarding. |
| Forwarding codes don't work | Some carriers use different codes. Contact the carrier's support for their specific forwarding setup instructions. |
| VoIP forwarding not working | Check that the Twilio number is entered in E.164 format (e.g., `+14161234567`) in the VoIP portal. |
