# Vapi Squad v4.0 — Architecture Improvements

## Overview

This document describes the architectural improvements made to the Vapi squad system in v4.0. It serves as a reference for understanding the design decisions, the new assistant structure, and how to handle growing complexity.

## Problem Statement (v3.x)

The v3.x squad had 7 assistants with several issues:

- **Long prompts** — Scheduling alone was ~175 lines / ~4K tokens, causing the LLM to skip critical instructions (email collection, name spelling, tool call order)
- **Too many tools per assistant** — Scheduling had 9+ tools, degrading tool selection accuracy
- **Auto-generated handoff tools** — `assistantDestinations` created invisible, untunable transfer tools
- **No enforcement mechanism** — Required steps (email, spelling) relied entirely on LLM compliance
- **Growing complexity problem** — Every new rule/edge case added to prompts, making them longer and less reliable

## Three-Layer Architecture

v4.0 uses a layered approach where each layer handles a different class of problem:

### Layer 1: Prompts (Identity & Flow)

Short, focused prompts (~50-80 lines) with:
- **MANDATORY RULES** section at the very top (highest LLM attention zone)
- Core identity and tone (3-5 lines)
- Brief workflow steps (numbered, not verbose)
- Routing triggers (table format)

Prompts should stay **short and stable**. New rules should go into Layer 2 whenever possible.

### Layer 2: Backend Tool Validation (Business Rules)

The webhook handler at `apps/backend/src/vapi/vapi-webhook.controller.ts` validates tool parameters before dispatching. Returns instructive error messages so the LLM can self-correct.

**Examples:**
- `bookAppointment` without email → `"VALIDATION ERROR: Email address is required..."`
- `createPatient` without firstName → `"VALIDATION ERROR: First name and last name are both required..."`
- `checkAvailability` with past date → `"VALIDATION ERROR: The date 2025-01-15 is in the past..."`

This is the **primary enforcement mechanism** because:
- It turns "the LLM forgot" into "the LLM gets corrected and retries"
- Rules are enforced by code, not LLM compliance
- New rules can be added without changing prompts
- It's testable and deterministic
- Works regardless of which model is used

### Layer 3: Handoff Tools (Routing Control)

v4.0 replaces the legacy `assistantDestinations` (auto-generated, invisible) with explicit `type: "handoff"` tools that support:
- **`contextEngineeringPlan`** — Control what conversation history transfers between assistants
- **`variableExtractionPlan`** — Extract structured data (patient name, reason) during handoff
- Future: **`rejectionPlan`** — Block premature handoffs

## New Assistant Structure (7 → 6)

| Assistant | Replaces | Tools | Prompt Size |
|-----------|----------|-------|-------------|
| **Receptionist** | Triage + Clinic Info | getProviders, KB query (~2) | ~60 lines |
| **Booking Agent** | Scheduling (booking) | checkAvailability, lookupPatient, createPatient, bookAppointment (4) | ~60 lines |
| **Appointment Mgmt** | Scheduling (cancel/reschedule) | lookupPatient, getAppointments, rescheduleAppointment, cancelAppointment (4) | ~50 lines |
| **Patient Records** | Patient Records (unchanged) | lookupPatient, updatePatient, addNote (3) | ~60 lines |
| **Insurance & Billing** | Insurance + Payment | lookupPatient, getInsurance, verifyInsuranceCoverage, getBalance, processPayment (5) | ~60 lines |
| **Emergency** | Emergency (unchanged) | lookupPatient, createPatient, checkAvailability, bookAppointment (4) | ~50 lines |

### Why This Structure

**Receptionist (merged Triage + Clinic Info):**
- Triage had zero tools — it only routed. Most calls start with simple questions that triggered unnecessary handoffs.
- Receptionist answers the top ~60% of calls directly (hours, services, "do you take my insurance?")
- No sensitive patient data — no security boundary concern

**Patient Records (kept separate):**
- HIPAA security boundary — must verify identity before sharing ANY info
- Handles PHI (allergies, medications, medical history)
- Risk of hallucinating medical advice if combined with a general-purpose assistant
- Strict audit requirements

**Scheduling split into Booking Agent + Appointment Mgmt:**
- Each gets 4 tools instead of 9+ — within the reliable tool selection range
- Prompts shrink from 175 lines to ~50-60 each
- Clean semantic split: "book new" vs "manage existing"

**Insurance & Billing merged:**
- Natural domain overlap — both require patient lookup + financial data
- Combined still only has 5 tools

## Handoff Tool Configuration

### Context Engineering

| Handoff | Context Plan | Rationale |
|---------|-------------|-----------|
| Receptionist → any specialist | `lastNMessages: 6` | Only need the initial exchange |
| Any specialist → Emergency | `all` | Emergency needs full context |
| Specialist → Receptionist (fallback) | `lastNMessages: 10` | Enough to re-route |
| Between specialists | `lastNMessages: 10` + variable extraction | Structured data, limited tokens |

### Variable Extraction

Handoffs between specialists extract:
```json
{
  "patientName": "Caller's name if mentioned",
  "reason": "What the caller needs help with"
}
```

## Handling Growing Complexity

As real-life testing reveals more dos/donts, use this decision tree:

1. **Can it be enforced by code?** → Add validation to the webhook handler (Layer 2)
2. **Is it about WHEN to route?** → Update handoff tool description or add a rejectionPlan
3. **Is it a factual answer?** → Add to knowledge base documents
4. **Does it fit in 1 line?** → Add to MANDATORY RULES section of the prompt (Layer 1)
5. **None of the above?** → Consider splitting the agent further

### Examples

| Rule | Where to Add |
|------|-------------|
| Must collect email before booking | Backend validation (reject bookAppointment without email) |
| Don't book on Sundays | Backend validation (reject Sunday dates with message) |
| Ask for spelling when name sounds unusual | MANDATORY RULES in prompt |
| Route to billing if caller mentions "how much" | Handoff tool description |
| Cancellation policy requires 24hr notice | Knowledge base document |
| Verify caller is the patient, not third party | Backend validation + MANDATORY RULES |

## HIPAA Guardrails (v4.0+)

### Tool Naming Cleanup

v4.0 consolidates and renames tools to reduce LLM confusion:

| Old Name(s) | New Name | Rationale |
|-------------|----------|-----------|
| `searchPatients` + `getPatientInfo` | `lookupPatient` | Merged — one clear action; the LLM no longer picks the wrong one |
| `addPatientInsurance` + `updatePatientInsurance` | `saveInsurance` | Merged — "add or update" is one action to the LLM |
| `addPatientNote` | `addNote` | Shorter, less likely to confuse with other "patient" tools |
| `getPatientInsurance` | `getInsurance` | Removes redundant "Patient" prefix |
| `getPatientBalance` | `getBalance` | Same reasoning |

Old names are preserved as aliases in the webhook controller for backward compatibility with v3.x templates.

### Caller Identity Verification

The `lookupPatient` backend handler automatically verifies the caller:

1. **Phone match**: Compares `call.customer.number` (Vapi call metadata) against the patient record's phone number.
2. **Verified response** (`callerVerified: true`): Returns full record — name, email, DOB, last visit, balance.
3. **Unverified response** (`callerVerified: false`): Returns only name + patientId. Includes a message instructing the AI to ask for date of birth before sharing details.

### PHI Field Redaction

Fields are categorized by sensitivity:

| Category | Fields | When Returned |
|----------|--------|---------------|
| Always safe | name, patientId | Always |
| Conditional | email, DOB, balance, lastVisit | Only when `callerVerified: true` |
| Never returned | SSN, full address, diagnostic codes, treatment history, clinical notes | Never via AI |

### Family Account Handling

When multiple patients share the same phone number (parent/guardian + children):

- `lookupPatient` returns `familyAccount: true` with a list of first names only
- AI asks: "Which family member are you calling about?"
- Once selected, proceeds with normal verified flow

### Anti-Hallucination Safeguards

Every `lookupPatient` response includes a `_hipaa` disclaimer:

> "Do not provide medical advice, diagnoses, or treatment recommendations. If the caller asks medical questions, say: 'That's a great question for your dentist. I can help you schedule an appointment to discuss that.'"

Balance responses include an additional `_balanceNote`:

> "Do not interpret or comment on whether the balance is high or low. Simply state the amount."

These fields are included in the tool response payload, not the system prompt, so they are present every time the tool is called regardless of prompt length.

### Rate Limiting

The webhook controller tracks tool calls per `callId`. If the same tool is called more than 5 times in a single call, the controller returns:

> "You have already called this tool multiple times. If you are not getting the expected result, apologize to the caller and offer to connect them with clinic staff."

This prevents infinite retry loops where the AI keeps calling `lookupPatient` with slightly different queries.

## File Reference

| File | Purpose |
|------|---------|
| `apps/frontend/.../vapi/templates/dental-clinic.template.ts` | Template definition — 6 assistants, prompts, handoff destinations |
| `apps/frontend/.../vapi/templates/template-utils.ts` | Hydration, tool injection, handoff tool building |
| `apps/frontend/.../vapi/vapi-pms-tools.config.ts` | Tool definitions and focused tool groups |
| `apps/frontend/.../vapi/vapi.service.ts` | Vapi API client (squad CRUD, assistants, tools) |
| `apps/backend/src/vapi/vapi-webhook.controller.ts` | Webhook handler with parameter validation |

## Version History

- **v3.3** — 7 assistants, legacy `assistantDestinations`, monolithic Scheduling prompt
- **v4.0** — 6 assistants, explicit handoff tools with context engineering, backend validation, short focused prompts
- **v4.1** — Tool cleanup (merged/renamed 7 tools), HIPAA guardrails (phone verification, PHI redaction, family accounts, anti-hallucination), per-call rate limiting
