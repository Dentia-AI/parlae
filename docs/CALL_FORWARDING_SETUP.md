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

## Recommended Setup: Forward All Calls + Dedicated Human Line

The recommended configuration is **unconditional (all calls) forwarding** combined with a **dedicated human line**:

| Component | Purpose |
|---|---|
| **Main clinic number** | Forwards all incoming calls to the AI receptionist |
| **Dedicated human line** | A separate number (cell, back line) where staff can be reached for emergencies and human transfer requests |

This gives clinics full AI coverage — every call is professionally handled. When a caller asks to speak with a human or there's an emergency, the AI transfers them to the dedicated human line.

### Alternative: No-Answer + Busy Forwarding

For clinics that prefer a gradual approach, no-answer + busy forwarding lets staff answer first. AI only picks up when nobody answers or lines are busy:

| Scenario | What Happens |
|---|---|
| During hours, staff answers | Call handled by staff (no forwarding) |
| During hours, staff busy | Call forwards to AI |
| During hours, staff doesn't pick up | Call forwards to AI after ~15-25 seconds |
| After hours, nobody answers | Call forwards to AI |

With this setup, the main clinic number can be used for human transfers since staff will answer the direct call before the no-answer timer kicks in.

## Carrier-Specific Instructions

### Canadian Carriers (Bell, Rogers, Telus, Fido, Koodo, Virgin)

#### Unconditional Forwarding (Recommended — All calls go to AI)
Forward all calls to the AI receptionist:
1. Pick up the clinic phone
2. Dial `*72` then the Twilio number (e.g., `*724161234567`)
3. Wait for confirmation tone
4. Hang up

**To disable**: Dial `*73`

#### No-Answer Forwarding (Alternative)
Forwards calls to AI when nobody answers within ~15-25 seconds:
1. Pick up the clinic phone
2. Dial `*92` then the Twilio number (e.g., `*924161234567`)
3. Wait for confirmation tone
4. Hang up

**To disable**: Dial `*93`

#### Busy Forwarding (Alternative — stack with No-Answer)
Forwards calls to AI when the clinic line is busy:
1. Pick up the clinic phone
2. Dial `*90` then the Twilio number (e.g., `*904161234567`)
3. Wait for confirmation tone
4. Hang up

**To disable**: Dial `*91`

### US Carriers (AT&T, Verizon, T-Mobile)

#### Unconditional Forwarding (Recommended)
1. Dial `*21*` then the Twilio number followed by `#` (e.g., `*21*14161234567#`)
2. Wait for confirmation

**To disable**: Dial `#21#`

#### No-Answer Forwarding (Alternative)
1. Dial `*61*` then the Twilio number followed by `#` (e.g., `*61*14161234567#`)
2. Wait for confirmation

**To disable**: Dial `#61#`

#### Busy Forwarding
1. Dial `*67*` then the Twilio number followed by `#` (e.g., `*67*14161234567#`)
2. Wait for confirmation

**To disable**: Dial `#67#`

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

### Dedicated Human Line

For clinics using **all-calls forwarding** (recommended), a **dedicated human line** is required. This is a separate phone number (cell phone, back office line, secondary landline) where staff can be reached. It must **not** have forwarding to the AI enabled.

When the AI needs to transfer a call to a human, it uses Vapi's `transferCall` to place a direct outbound PSTN call to this dedicated line, bypassing the forwarding chain entirely.

For clinics using **no-answer/busy forwarding**, a separate human line is optional — the main clinic number works for transfers because staff will answer the direct call before the no-answer timer kicks in.

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
