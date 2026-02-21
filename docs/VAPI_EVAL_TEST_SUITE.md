# Vapi Dental Clinic Eval Test Suite

Chat-based eval suite for rigorously testing the dental clinic squad's routing, handoffs, tool calls, and prompt adherence using Vapi's Eval API.

## Overview

This suite uses **chat-based evals** (not voice) — meaning **no STT/TTS/telephony costs**. You only pay for LLM inference per eval run. This makes it ideal for rapid prompt iteration and model comparison.

**Location**: `apps/frontend/packages/shared/src/vapi/evals/`

## Test Coverage

| Category | Tests | What It Validates |
|---|---|---|
| `triage-routing` | 12 | Triage receptionist routes to correct specialist for every scenario |
| `silent-handoff` | 3 | Assistants never say "transfer/transferring", use natural language |
| `scheduling` | 6 | Full booking/cancel/reschedule workflows, correct tool call ordering |
| `emergency` | 4 | Life-threatening vs urgent handling, 911 advice, first aid |
| `tool-calls` | 5 | Correct tool names, required params, date formats, PCI compliance |
| `cross-routing` | 5 | Routing between non-triage assistants (Scheduling→Insurance, etc.) |
| `hipaa` | 2 | Identity verification before sharing data, change confirmation |
| `insurance` | 2 | Add/verify insurance workflows with correct data collection |
| `payment` | 2 | Balance inquiries, payment plan setup, empathetic tone |
| `error-handling` | 2 | Graceful degradation when tools fail, patient-not-found recovery |
| `edge-cases` | 5 | Human transfer requests, angry callers, ambiguous requests |

**Total: ~48 eval tests across 11 categories**

## Prerequisites

- Node.js 18+ with `tsx` available (`npx tsx`)
- A Vapi API key (from [dashboard.vapi.ai](https://dashboard.vapi.ai/))
- A deployed squad ID to test against

## Quick Start

```bash
# Set environment variables
export VAPI_API_KEY="your-vapi-api-key"
export VAPI_SQUAD_ID="your-squad-id"

# Navigate to the evals directory
cd apps/frontend/packages/shared/src/vapi/evals

# List all available tests
npx tsx run-evals.ts --list

# Run ALL tests
npx tsx run-evals.ts

# Run only critical tests (faster, cheaper)
npx tsx run-evals.ts --tag critical

# Run a specific category
npx tsx run-evals.ts --category triage-routing
npx tsx run-evals.ts --category scheduling
npx tsx run-evals.ts --category emergency
```

## Comparing AI Models

To compare how different models perform against the same prompts:

1. **Deploy squad variant A** (e.g., with `gpt-4o`), note the squad ID.
2. **Run evals** with a descriptive label:

```bash
export VAPI_SQUAD_ID="squad-id-gpt4o"
npx tsx run-evals.ts --label "gpt-4o"
```

3. **Deploy squad variant B** (e.g., with `gpt-5-mini`), note the squad ID.
4. **Run evals** again:

```bash
export VAPI_SQUAD_ID="squad-id-gpt5-mini"
npx tsx run-evals.ts --label "gpt-5-mini"
```

5. Compare the JSON result files:
   - `eval-results-gpt-4o.json`
   - `eval-results-gpt-5-mini.json`

Each result file contains per-test pass/fail status, failure reasons, and timing.

## Prompt Iteration Workflow

1. **Run the full suite** → identify failing tests
2. **Read the failure reasons** in the console output or JSON
3. **Update the prompt** in `dental-clinic.template.ts`
4. **Re-deploy the squad** with the updated prompt
5. **Re-run the failing category** to verify the fix:

```bash
npx tsx run-evals.ts --category scheduling --label "prompt-v2"
```

6. **Repeat** until 100% pass rate

## Understanding Results

### Console Output

```
═══════════════════════════════════════════════════════════════
  EVAL RESULTS: gpt-5-mini-run
═══════════════════════════════════════════════════════════════

  Total: 48  |  Pass: 42  |  Fail: 5  |  Error: 1  |  Rate: 87.5%

───────────────────────────────────────────────────────────────
  [triage-routing] 11/12 passed
    ✅ Triage → Emergency: Severe pain
    ✅ Triage → Scheduling: Book cleaning
    ❌ Triage Priority: Emergency trumps appointment request
       └─ Routed to Scheduling instead of Emergency Transfer
```

### JSON Output

Each run produces `eval-results-{label}.json`:

```json
{
  "label": "gpt-5-mini-run",
  "timestamp": "2026-02-18T20:00:00.000Z",
  "results": [
    {
      "name": "Triage → Emergency: Severe pain",
      "category": "triage-routing",
      "status": "pass",
      "evalId": "eval-xxx",
      "runId": "run-xxx",
      "durationMs": 4200
    }
  ]
}
```

## Test Categories in Detail

### Triage Routing (`triage-routing`)
Tests that the Triage Receptionist correctly identifies caller needs from keywords and routes to the right specialist. Includes priority testing (emergency trumps scheduling).

### Silent Handoff (`silent-handoff`)
Ensures no assistant ever says "transferring", "let me transfer you", or similar forbidden phrases. Validates seamless conversation continuity.

### Scheduling (`scheduling`)
Tests the full booking workflow order:
1. `checkAvailability` called FIRST (before patient lookup)
2. Correct date format (YYYY-MM-DD, year 2026+)
3. Patient search → create if not found → collect email → book
4. Cancel/reschedule flows
5. No dead air (always asks a question or calls a tool)

### Emergency (`emergency`)
- Life-threatening → advise 911
- Urgent → book emergency appointment TODAY
- First aid advice provided while arranging care
- No greeting after silent handoff

### Tool Calls (`tool-calls`)
Validates specific tool parameters:
- `searchPatients` uses caller phone number (not asking for it)
- `bookAppointment` includes ALL 8 required fields
- `createPatient` requires email before calling
- `processPayment` confirms amount before processing
- Never asks for credit card numbers (PCI compliance)

### Cross-Routing (`cross-routing`)
Tests routing between non-triage assistants:
- Scheduling → Insurance (coverage question)
- Insurance → Scheduling (wants to book)
- Payment → Insurance (coverage vs billing)
- Any → Emergency (urgent symptoms mid-call)

### HIPAA (`hipaa`)
- Identity verification before sharing patient info
- Confirms changes before updating records

### Error Handling (`error-handling`)
- Tool failures: never hang up, offer alternatives
- Patient not found: offer to create new record

### Edge Cases (`edge-cases`)
- Caller requests a human
- Multiple needs (prioritization)
- Angry/frustrated caller
- Non-dental medical questions
- Confirmation readback before booking

## Isolated Testing (Recommended Workflow)

The isolated runner lets you focus on one area at a time — fix it, then move on.

### File Structure

```
evals/
  eval-config.ts                    ← EDIT THIS: model, temperature, prompts
  run-isolated.ts                   ← Isolated runner
  run-evals.ts                      ← Full suite runner
  dental-clinic-eval-suite.ts       ← Comprehensive test definitions
  tests/
    triage-handoff.tests.ts         ← 85+ triage utterance variations
    scheduling-flow.tests.ts        ← 25+ scheduling workflow tests
```

### Step 1: Configure in `eval-config.ts`

Open `eval-config.ts` and set your model at the top:

```typescript
// Uncomment the model you want to test:
export const ACTIVE_MODEL: ModelConfig = {
  provider: 'openai',
  model: 'gpt-5-mini',       // ← change this
  temperature: 0.3,           // ← change this
  maxTokens: 500,
  label: 'gpt-5-mini',
};
```

To experiment with a different prompt, set it in `PROMPT_OVERRIDES`:

```typescript
PROMPT_OVERRIDES['Triage Receptionist'] = `
## IDENTITY
You are the receptionist at {{clinicName}}.
... your experimental prompt here ...
`;
```

### Step 2: Run isolated tests

```bash
cd apps/frontend/packages/shared/src/vapi/evals

# See all available suites and groups
npx tsx run-isolated.ts list

# --- TRIAGE TESTS ---
npx tsx run-isolated.ts triage                # ALL triage tests (~85)
npx tsx run-isolated.ts triage emergency      # Only emergency routing (20 utterances)
npx tsx run-isolated.ts triage scheduling     # Only scheduling routing (20 utterances)
npx tsx run-isolated.ts triage insurance      # Only insurance routing (10 utterances)
npx tsx run-isolated.ts triage payment        # Only payment routing (10 utterances)
npx tsx run-isolated.ts triage records        # Only patient records routing (8 utterances)
npx tsx run-isolated.ts triage clinicInfo     # Only clinic info routing (10 utterances)
npx tsx run-isolated.ts triage priority       # Priority + edge cases (7 tests)

# --- SCHEDULING TESTS ---
npx tsx run-isolated.ts scheduling                 # ALL scheduling tests (~25)
npx tsx run-isolated.ts scheduling takeover        # Seamless handoff takeover (3 tests)
npx tsx run-isolated.ts scheduling toolOrder       # Correct tool call sequence (5 tests)
npx tsx run-isolated.ts scheduling continuation    # No dead air after tools (5 tests)
npx tsx run-isolated.ts scheduling requiredFields  # Email/name collection (4 tests)
npx tsx run-isolated.ts scheduling confirmation    # Readback before booking (1 test)
npx tsx run-isolated.ts scheduling errorHandling   # Tool failure recovery (2 tests)
npx tsx run-isolated.ts scheduling crossRouting    # Mid-conversation routing (2 tests)
```

### Step 3: Fix and iterate

1. Run a focused group (e.g., `triage emergency`)
2. See which tests fail and read the failure reasons
3. Update the prompt in `eval-config.ts` → `PROMPT_OVERRIDES`
4. Re-run the same group
5. When it passes, move to the next group

### Comparing Models

```bash
# Test with gpt-5-mini (set in eval-config.ts)
npx tsx run-isolated.ts triage emergency
# → saves eval-results-triage-emergency-gpt-5-mini-t0.3.json

# Change ACTIVE_MODEL to gpt-4o in eval-config.ts, then:
npx tsx run-isolated.ts triage emergency
# → saves eval-results-triage-emergency-gpt-4o-t0.3.json

# Compare the two JSON files
```

## Cleanup

To delete all evals you created from Vapi:

```bash
npx tsx run-evals.ts --cleanup
```

## Cost Estimate

Chat evals only use the LLM — no voice costs:
- ~$0.01–0.05 per eval (depending on model and conversation length)
- Full suite of 48 tests: ~$0.50–2.50 per run
- AI judge evals cost slightly more (additional GPT-4o inference for judging)

This is roughly **50–100x cheaper** than voice test suites.

## Adding New Tests

Add new eval definitions to `dental-clinic-eval-suite.ts`:

```typescript
const myNewTests: EvalDefinition[] = [
  {
    name: 'My Test Name',
    description: 'What this test validates',
    type: 'chat.mockConversation',
    category: 'my-category',
    tags: ['relevant', 'tags'],
    messages: [
      { role: 'user', content: 'User says this' },
      {
        role: 'assistant',
        judgePlan: aiJudge(`
Pass criteria:
- Expected behavior 1
- Expected behavior 2

Fail criteria:
- Unacceptable behavior 1`),
      },
    ],
  },
];
```

Then add to `ALL_EVAL_DEFINITIONS` and `EVAL_CATEGORIES`.

## CI/CD Integration

```yaml
# .github/workflows/test-squad.yml
name: Test Squad Prompts
on:
  pull_request:
    paths:
      - "apps/frontend/packages/shared/src/vapi/templates/**"
jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install -g tsx
      - run: npx tsx apps/frontend/packages/shared/src/vapi/evals/run-evals.ts --tag critical
        env:
          VAPI_API_KEY: ${{ secrets.VAPI_API_KEY }}
          VAPI_SQUAD_ID: ${{ secrets.VAPI_SQUAD_ID }}
```
