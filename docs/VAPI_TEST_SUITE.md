# Vapi AI Test Suite

Deterministic, text-based test suite for validating the dental clinic AI assistant. Tests run against individual assistants via Vapi's Chat API (`POST /chat`), verifying tool calls, backend responses, and conversational behavior.

## Prerequisites

| Requirement | Details |
|---|---|
| Node 18+ | `node --version` |
| pnpm | `pnpm --version` |
| `tsx` | Installed globally or via `npx tsx` |
| Vapi API key | Obtain from [dashboard.vapi.ai](https://dashboard.vapi.ai) |
| Vapi Squad ID | The production squad to test against |
| Backend running | Backend must be deployed/running for webhook tools to fire |

## Environment Variables

```bash
export VAPI_API_KEY="your-vapi-api-key"
export VAPI_SQUAD_ID="your-squad-id"
```

No secrets are hardcoded in the codebase — all configuration comes from environment variables.

## Quick Start

```bash
cd apps/frontend/packages/shared/src/vapi/simulations

# Run all tests
npx tsx run-chat-tests.ts all

# Run a single suite
npx tsx run-chat-tests.ts booking

# List all available scenarios
npx tsx run-chat-tests.ts list

# Show help
npx tsx run-chat-tests.ts help
```

## Test Suites

| Suite | CLI Key | Count | Description |
|---|---|---|---|
| Booking | `booking` | 15 | New patient booking flows — happy paths + adversarial edge cases |
| Tool Verification | `tool` | 6 | Verifies correct tool calls, params, and no hallucinated results |
| Handoff | `handoff` | 3 | Squad-level transfer between assistants (limited in Chat API) |
| HIPAA | `hipaa` | 9 | HIPAA compliance — no medical advice, no PHI leaks, identity verification |
| Emergency | `emergency` | 5 | Emergency detection, escalation, subtle symptoms, false alarms |
| Appointment Mgmt | `appt` | 7 | Cancel and reschedule flows — happy paths + edge cases |
| **All** | `all` | **45** | Every scenario above |

> **Note:** The `handoff` suite tests squad-level transfers which have limited tool visibility in the Chat API. These 3 scenarios are included for completeness but may behave differently than voice calls.

## How It Works

1. **Runner resolves assistant IDs** from the squad — maps roles (receptionist, booking, etc.) to assistant IDs by inspecting system prompts.
2. **For each scenario**, the runner sends scripted user messages to the correct assistant via `POST /chat`.
3. **Per-step assertions** check tool calls and response text after each message.
4. **Final assertions** run against the full conversation — accumulated tool calls and full transcript.
5. **Results** are printed to stdout and saved as timestamped JSON files.

### Why Chat API (not voice)?

- **Deterministic**: Text input = reproducible results, no STT/TTS variance.
- **Real webhook tools**: Individual assistant Chat API calls fire actual backend webhook tools.
- **Fast**: Each scenario completes in 5-30 seconds vs. minutes for voice simulations.
- **Inspectable**: Tool calls and backend responses are visible in the Chat API response.

## File Structure

```
simulations/
├── run-chat-tests.ts          # Test runner CLI
├── sim-api.ts                 # Vapi Chat API client (startChat, continueChat)
├── sim-config.ts              # Configuration (env vars, base URL)
├── create-test-squad.ts       # Utility: clone squad with modified prompts
└── scenarios/
    └── chat-scenarios.ts      # All test scenario definitions
```

## Assertion Types

### Text Assertions (per-step, applied to assistant response text)

| Type | Description | Fields |
|---|---|---|
| `contains` | Response text includes substring (case-insensitive) | `value` |
| `not_contains` | Response text must NOT include substring | `value` |
| `regex` | Response text matches regex pattern | `value` (pattern), optional flags |

### Tool Assertions (per-step or final, applied to extracted tool calls)

| Type | Description | Fields |
|---|---|---|
| `tool_called` | Tool was invoked at least once | `toolName` |
| `tool_not_called` | Tool was never invoked | `toolName` |
| `tool_succeeded` | Tool was called and response contains `[SUCCESS]` | `toolName` |
| `tool_failed` | Tool was called and response does NOT contain `[SUCCESS]` | `toolName` |
| `tool_param_contains` | Tool was called with param containing value | `toolName`, `paramKey`, `paramValue` |
| `tool_param_exists` | Tool was called with param present (any value) | `toolName`, `paramKey` |
| `tool_response_contains` | Tool's backend response contains substring | `toolName`, `paramValue` (search text) |
| `tool_call_count` | Tool was called exactly N times | `toolName`, `count` |

### Transcript Assertions (final, applied to full conversation transcript)

Same types as text assertions (`contains`, `not_contains`, `regex`) but applied to the entire concatenated transcript rather than a single step.

## Writing New Scenarios

Add scenarios to `scenarios/chat-scenarios.ts`. Each scenario is a `ChatTestScenario` object:

```typescript
const MY_NEW_SCENARIO: ChatTestScenario = {
  name: 'My scenario name',
  category: 'booking',  // booking | tools | handoff | hipaa | emergency | appointment-mgmt
  targetAssistant: 'booking',  // which assistant to chat with
  steps: [
    {
      userMessage: 'I need to book a cleaning appointment',
      textAssertions: [
        { type: 'not_contains', value: 'I cannot help' },
      ],
      toolAssertions: [],
    },
    {
      userMessage: 'John Smith, john@example.com, 555-0100',
      textAssertions: [],
      toolAssertions: [
        { type: 'tool_called', toolName: 'createPatient' },
        { type: 'tool_param_contains', toolName: 'createPatient', paramKey: 'email', paramValue: 'john@example.com' },
      ],
    },
  ],
  finalToolAssertions: [
    { type: 'tool_succeeded', toolName: 'checkAvailability', label: 'Availability was checked' },
    { type: 'tool_call_count', toolName: 'createPatient', count: 1, label: 'Patient created exactly once' },
  ],
  transcriptAssertions: [
    { type: 'not_contains', value: 'error' },
  ],
};
```

Then add it to the appropriate `ALL_*_SCENARIOS` array at the bottom of the file.

### Scenario Tips

- **Be explicit in user messages**: The AI in Chat mode has no voice tone context. Say things like "Morning please. 9 AM works." rather than "That sounds good."
- **Test one thing per scenario**: A booking scenario should focus on booking, not HIPAA.
- **Use `NO_STALL_ASSERTIONS`**: Add the shared stall-detection assertions to booking scenarios to catch AI loops.
- **Adversarial scenarios**: Include off-topic interruptions, vague requests, misspellings, refusal to provide info.

## Extending for Future Changes

### Adding new tool parameters

If a tool gains new params (e.g., `insuranceId`, `reason`):

1. Add a scenario that provides the new param in conversation.
2. Use `tool_param_exists` to assert the param is sent.
3. Use `tool_param_contains` to check the value.

```typescript
toolAssertions: [
  { type: 'tool_param_exists', toolName: 'bookAppointment', paramKey: 'insuranceId' },
  { type: 'tool_param_contains', toolName: 'bookAppointment', paramKey: 'reason', paramValue: 'cleaning' },
],
```

### Verifying backend responses

Use `tool_response_contains` to check what the backend returned:

```typescript
finalToolAssertions: [
  { type: 'tool_response_contains', toolName: 'lookupPatient', paramValue: '[SUCCESS]' },
  { type: 'tool_response_contains', toolName: 'getAppointments', paramValue: 'appointment found' },
],
```

### Switching AI models

The test scenarios are model-agnostic. After switching models in your squad:

1. Run `npx tsx run-chat-tests.ts all` to validate.
2. Compare pass rates and response times across models.
3. Results JSON files include cost and duration for benchmarking.

### Adding a new assistant role

1. Add the role to `AssistantRole` type in `chat-scenarios.ts`.
2. Add role detection logic in `run-chat-tests.ts` (`roleSignatures` and `nameToRole` maps).
3. Create scenarios targeting the new assistant.
4. Add a new suite entry in the `SUITES` object and a new `ALL_*_SCENARIOS` array.

## Utility: Test Squad Cloning

Clone the production squad to test prompt changes without deploying:

```bash
cd apps/frontend/packages/shared/src/vapi/simulations

# Clone prod squad with updated prompts
VAPI_API_KEY=... VAPI_SQUAD_ID=... npx tsx create-test-squad.ts create

# Update prompts on existing test squad
VAPI_API_KEY=... VAPI_SQUAD_ID=... npx tsx create-test-squad.ts update

# Delete test squad
VAPI_API_KEY=... VAPI_SQUAD_ID=... npx tsx create-test-squad.ts delete
```

## Output

### Console

Each scenario prints pass/fail with duration and cost. Failed assertions show the specific failure detail. A summary table appears at the end of each suite.

### JSON Results

Results are saved as `chat-results-<suite>-<timestamp>.json` in the simulations directory. These files are gitignored. Each result includes:

- Per-step assertion results
- All extracted tool calls with arguments and responses
- Full conversation transcript
- Duration and Vapi cost per scenario

## Troubleshooting

| Issue | Solution |
|---|---|
| `VAPI_API_KEY environment variable is required` | Set the env var before running |
| `No assistant found for role: X` | Squad structure changed — update `roleSignatures` in the runner |
| Rate limiting (429) | Runner has automatic retry with exponential backoff (up to 5 retries) |
| Tool never called | Make user messages more explicit ("Please check the calendar for availability") |
| Assertion too strict | Use `not_contains` instead of exact `contains`; relax regex patterns |
| Handoff tests unreliable | Known limitation — Chat API has limited squad-level transfer support |
