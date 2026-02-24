# Retell AI vs Vapi: Comprehensive Comparison for Dental Clinic Receptionist

**Date:** February 23, 2026  
**Use Case:** Building a voice AI dental clinic receptionist

---

## Executive Summary

**Retell AI** offers a more integrated, low-code platform with built-in features like knowledge bases, warm transfers, and HIPAA compliance included. **Vapi** provides more developer control with "bring your own" components (STT, TTS, LLM) and advanced multi-agent routing via Squads.

**Key Decision Factors:**
- **Choose Retell** if you prioritize ease of setup, built-in compliance, and transparent pricing
- **Choose Vapi** if you need advanced multi-agent routing (Squads), extensive customization, or want to use your own LLM/STT/TTS providers

---

## 1. Agent/Assistant Creation

### Retell AI

**Agent Creation:**
- **API Endpoint:** `POST /create-agent`
- **Dashboard:** Low-code drag-and-drop interface (3-5 minute setup)
- **Agent Types:**
  - **Single/Multi-Prompt Agent:** Flexible, prompt-based configuration for dynamic conversations
  - **Conversation Flow Agent:** Fine-grained control for structured conversations with visual flow builder
- **Response Engines:**
  - **Retell LLM:** Built-in response engine (GPT-4.1, GPT-5.2, etc.)
  - **Custom LLM:** Integrate OpenAI, Azure OpenAI, or OpenRouter via WebSocket
  - **Conversation Flow:** Visual flow builder with nodes and conditions

**Multi-Agent Routing:**
- ❌ **No native "Squad" equivalent** — Retell does not have a built-in multi-agent routing system like Vapi's Squads
- ✅ **Agent Transfer:** Can transfer between AI agents within the same call (Agent Swap)
  - Near-instant transitions
  - Full conversation history preserved
  - No separate phone numbers needed
- ✅ **Call Transfer:** Can transfer to external phone numbers (warm/cold transfer)
- ⚠️ **Workaround:** Use function calling to implement custom routing logic, but requires manual implementation

**Agent Configuration:**
- Version control (agent versions)
- Agent overrides per call
- Dynamic variable injection
- Metadata storage

### Vapi

**Agent Creation:**
- **API Endpoint:** `POST /assistant`
- **Code-first approach** — requires coding for most features
- **Agent Configuration:**
  - System prompts
  - Model selection (GPT-4o, GPT-5.2, Claude, etc.)
  - Voice selection
  - Tool/function definitions

**Multi-Agent Routing (Squads):**
- ✅ **Squads:** Native multi-agent routing system
  - **API Endpoint:** `POST /squad`
  - **Members:** Array of agents with routing rules
  - **Routing:** LLM-based routing to select the best agent for each turn
  - **Members Overrides:** Per-agent configuration overrides
  - **Use Case:** Perfect for complex workflows where different agents handle different tasks (e.g., front-desk → appointment-booking → billing)
- **Squad Structure:**
  ```typescript
  {
    name: "Dental Clinic Squad",
    members: [
      { assistantId: "receptionist", ... },
      { assistantId: "scheduler", ... },
      { assistantId: "billing", ... }
    ],
    membersOverrides: { ... }
  }
  ```

**Comparison:**
- **Vapi wins** for multi-agent routing — Squads provide native, LLM-based routing between specialized agents
- **Retell wins** for ease of setup — visual builder vs code-first

---

## 2. Custom Tools/Functions

### Retell AI

**Custom Functions:**
- ✅ **Webhook-based execution** — Retell sends POST requests to your endpoint
- **Configuration:**
  - Function name and description
  - HTTP method (GET, POST, PATCH, PUT, DELETE)
  - Endpoint URL
  - Request headers (static or dynamic variables)
  - Query parameters
  - JSON schema for parameters (POST/PATCH/PUT)
  - Response variable extraction (save values as dynamic variables)
  - Speech behavior (speak during/after execution)

**Request Format:**
```json
{
  "args": { /* function parameters */ },
  "call": { /* call object with transcript */ },
  "name": "function_name"
}
```

**Response Format:**
- Status code 200-299 = success
- Supports: JSON, blob, buffer, string
- Result capped at 15,000 characters
- Timeout: 2 minutes (configurable)
- Retries: Up to 2 retries on failure

**Security:**
- `X-Retell-Signature` header for verification
- IP allowlisting: `100.20.5.228`
- Signature verification using API key

**Example:**
```javascript
// Retell sends POST to your endpoint
app.post("/check-weather", async (req, res) => {
  const { args, call, name } = req.body;
  // Verify signature
  if (!Retell.verify(JSON.stringify(req.body), API_KEY, req.headers["x-retell-signature"])) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  // Execute function
  const result = await checkWeather(args.city);
  return res.json({ result });
});
```

### Vapi

**Server-Side Functions:**
- ✅ **Webhook-based execution** — Vapi sends POST requests to your webhook URL
- **Configuration:**
  - Function name and description
  - Parameters schema (JSON Schema)
  - Server URL (webhook endpoint)
  - Authentication (secret or credentialId)

**Request Format:**
```json
{
  "message": {
    "type": "function-call",
    "functionCall": {
      "name": "bookAppointment",
      "parameters": { /* parsed parameters */ },
      "arguments": "/* JSON string */"
    },
    "call": { /* call object */ }
  }
}
```

**Response Format:**
```json
{
  "result": "/* string result */"
}
```

**Security:**
- `X-Vapi-Secret` header
- `Authorization: Bearer <token>` (alternative)
- Signature verification

**Example:**
```typescript
// Vapi sends POST to your webhook
app.post("/vapi/webhook", async (req, res) => {
  const { message } = req.body;
  if (message.type === "function-call") {
    const { name, parameters } = message.functionCall;
    const result = await handleTool(name, parameters, message.call);
    return res.json({ result: JSON.stringify(result) });
  }
});
```

**Comparison:**
- **Tie** — Both support webhook-based tool execution with similar capabilities
- **Retell** has more built-in features (response variable extraction, speech behavior control)
- **Vapi** has simpler response format (just return a string)

---

## 3. Phone Number Management

### Retell AI

**Phone Number Provisioning:**
- **API Endpoint:** `POST /create-phone-number`
- **Dashboard:** Purchase numbers via UI
- **Supported Regions:** US and Canada
- **Pricing:**
  - US/Canada: $2/month
  - Toll-free: $5/month + $0.06/minute for inbound calls
- **Ownership:** Numbers remain yours indefinitely once purchased

**Number Configuration:**
- **Inbound Agent:** Assign `inbound_agent_id` to handle inbound calls
- **Outbound Agent:** Can use different agent for outbound calls on same number
- **Inbound Webhook:** Optional webhook for dynamic routing (see section 4)

**API Example:**
```json
{
  "number": "+12137771234",
  "inbound_agent_id": "agent_12345",
  "inbound_agent_version": 1
}
```

### Vapi

**Phone Number Provisioning:**
- **API Endpoint:** `POST /phone-number`
- **Dashboard:** Purchase numbers via UI
- **Supported Regions:** US, Canada, and international
- **Pricing:** Varies by region and provider (Twilio-based)

**Number Configuration:**
- Associate phone number with assistant/squad
- Can use same number for multiple assistants via routing logic
- Metadata support for account association

**Comparison:**
- **Retell** has simpler, more transparent pricing
- **Vapi** supports more regions but pricing is less transparent
- Both support inbound/outbound configuration

---

## 4. Inbound Call Handling

### Retell AI

**Inbound Call Routing:**
- **Static Routing:** Assign `inbound_agent_id` to phone number
- **Dynamic Routing:** Use **Inbound Webhook** for per-call routing

**Inbound Webhook:**
- **Trigger:** Fires when inbound call/SMS arrives (before call connects)
- **Timeout:** 10 seconds
- **Retries:** Up to 3 times
- **Request Payload:**
  ```json
  {
    "event": "call_inbound",
    "call_inbound": {
      "agent_id": "agent_12345",
      "agent_version": 1,
      "from_number": "+12137771234",
      "to_number": "+12137771235"
    }
  }
  ```
- **Response Payload:**
  ```json
  {
    "call_inbound": {
      "override_agent_id": "agent_67890",
      "override_agent_version": 2,
      "agent_override": { /* per-call agent settings */ },
      "dynamic_variables": { "customer_name": "John Doe" },
      "metadata": { "account_id": "123" }
    }
  }
  ```
- **Use Cases:**
  - Route calls to different agents based on caller number
  - Set custom context per caller
  - Filter/reject unwanted calls
  - Override agent settings per call

**Call Flow:**
1. Inbound call arrives
2. Inbound webhook fires (if configured)
3. Your server responds with agent override (optional)
4. Call connects to specified agent
5. If webhook fails → uses default `inbound_agent_id` or rejects call

### Vapi

**Inbound Call Routing:**
- **Assistant Request Webhook:** `assistant-request` event fires when call starts
- **Request Payload:**
  ```json
  {
    "message": {
      "type": "assistant-request",
      "call": { /* call object */ },
      "assistant": { /* assistant config */ }
    }
  }
  ```
- **Response:** Return assistant configuration or routing decision
- **Squad Routing:** If using Squads, routing happens automatically based on LLM decision

**Comparison:**
- **Retell** has more explicit inbound webhook with richer override options
- **Vapi** relies more on assistant-request webhook or Squad routing
- **Retell** allows filtering/rejecting calls before connection
- Both support dynamic routing, but Retell's inbound webhook is more specialized

---

## 5. Transfer/Handoff

### Retell AI

**Transfer Types:**

1. **Agent Transfer (Agent Swap):**
   - Transfer between AI agents within the same call
   - ✅ No separate phone numbers needed
   - ✅ Full conversation history preserved
   - ✅ Near-instant transitions
   - ✅ Better reliability (no new phone call)
   - **Configuration:** Add "Agent Transfer" tool to agent
   - **API:** Specify target agent ID and version

2. **Call Transfer:**
   - Transfer to external phone number
   - **Warm Transfer:** AI briefs receiving agent with full context
   - **Cold Transfer:** Direct transfer without context
   - **Configuration:** Add "Call Transfer" function
   - **Transfer Events:** `transfer_started`, `transfer_bridged`, `transfer_cancelled`, `transfer_ended`

**Transfer Configuration:**
```json
{
  "transfer_agent": {
    "agent_id": "agent_67890",
    "agent_version": 1
  },
  "speak_during_execution": true,
  "speak_after_execution": false
}
```

### Vapi

**Transfer Types:**

1. **Squad Routing:**
   - LLM-based routing between agents in a Squad
   - Seamless handoff with conversation context
   - No explicit transfer needed — routing happens automatically

2. **Call Transfer:**
   - Transfer to external phone number
   - **API:** `transferCall` function/tool
   - **Configuration:** Define transfer function in assistant tools

**Transfer Function Example:**
```typescript
{
  name: "transferToHuman",
  description: "Transfer call to human operator",
  parameters: {
    type: "object",
    properties: {
      reason: { type: "string" },
      summary: { type: "string" }
    }
  }
}
```

**Comparison:**
- **Retell** has more explicit transfer features (Agent Transfer vs Call Transfer)
- **Retell** supports warm transfers with context briefing
- **Vapi** Squad routing is more seamless but less explicit
- **Retell** has better transfer event tracking

---

## 6. TTS/STT Configuration

### Retell AI

**Speech-to-Text (STT):**
- **Provider:** OpenAI Whisper (default)
- **Modes:**
  - `fast` — Low latency (default)
  - `accurate` — Higher accuracy
  - `custom` — Custom STT config (Azure, Deepgram)
- **Custom STT:**
  ```json
  {
    "stt_mode": "custom",
    "custom_stt_config": {
      "provider": "azure" | "deepgram",
      "endpointing_ms": 100
    }
  }
  ```
- **Features:**
  - Boosted keywords (bias transcription)
  - Vocabulary specialization (`general` or `medical`)
  - Denoising modes

**Text-to-Speech (TTS):**
- **Providers:** ElevenLabs, Google Cloud, Azure, Cartesia, Minimax
- **Voice Models:**
  - ElevenLabs: `eleven_turbo_v2`, `eleven_flash_v2`, `eleven_multilingual_v2`, `sonic-2`, `sonic-3`, `sonic-turbo`
  - OpenAI: `tts-1`, `gpt-4o-mini-tts`
  - Google: `speech-02-turbo`, `speech-2.8-turbo`
  - Cartesia: `s1`
- **Voice Configuration:**
  - Voice ID selection
  - Voice temperature (0-2)
  - Voice speed (0.5-2)
  - Dynamic voice speed adjustment
  - Volume control (0-2)
  - Voice emotion (calm, sympathetic, happy, sad, angry, fearful, surprised)
  - Fallback voices (automatic failover)
  - Pronunciation dictionary (IPA/CMU)

### Vapi

**Speech-to-Text (STT):**
- **Bring Your Own (BYO):** Use your own STT provider
- **Supported Providers:** Deepgram, AssemblyAI, Google, Azure, etc.
- **Configuration:** Set STT provider in assistant config

**Text-to-Speech (TTS):**
- **Bring Your Own (BYO):** Use your own TTS provider
- **Supported Providers:** ElevenLabs, PlayHT, Azure, Google, etc.
- **Configuration:** Set TTS provider and voice ID in assistant config

**Comparison:**
- **Retell** has more built-in TTS options and voice models
- **Retell** has better STT configuration (modes, vocabulary specialization)
- **Vapi** offers more flexibility with BYO providers
- **Retell** has better voice features (emotion, pronunciation dictionary)

---

## 7. LLM Configuration

### Retell AI

**Built-in LLMs (Retell LLM):**
- **Models:**
  - GPT-4.1, GPT-4.1-mini, GPT-4.1-nano
  - GPT-5, GPT-5.1, GPT-5.2, GPT-5-mini, GPT-5-nano
- **Configuration:**
  - Model selection
  - Temperature (0.0-1.0)
  - Structured output
  - Fast tier (premium, 1.5x cost, 25% faster)
  - Knowledge base integration
  - Tool calling

**Custom LLM Integration:**
- **Supported:** OpenAI, Azure OpenAI, OpenRouter
- **Architecture:** WebSocket server that exchanges JSON with Retell
- **Setup:** Create backend WebSocket server, Retell connects to it
- **Example:** [retell-custom-llm-node-demo](https://github.com/retellai/retell-custom-llm-node-demo)

**LLM Configuration:**
```json
{
  "response_engine": {
    "type": "retell-llm",
    "llm_id": "llm_12345",
    "version": 0
  }
}
```

### Vapi

**LLM Configuration:**
- **Bring Your Own (BYO):** Use any LLM provider
- **Supported:** OpenAI (GPT-4o, GPT-5.2), Anthropic (Claude), etc.
- **Configuration:** Set model in assistant config
- **System Prompts:** Full control over system prompts

**Comparison:**
- **Retell** has more built-in models (GPT-4.1, GPT-5.2 family)
- **Retell** has Fast Tier for premium performance
- **Vapi** offers more flexibility with any LLM provider
- **Retell** custom LLM requires WebSocket server (more complex)
- **Vapi** simpler integration for custom LLMs

---

## 8. System Prompts

### Retell AI

**Prompt Configuration:**
- **Single/Multi-Prompt Agent:** Set prompts in agent configuration
- **Conversation Flow Agent:** Prompts configured per node in flow
- **Dynamic Variables:** Inject variables into prompts (`{{variable_name}}`)
- **Agent Overrides:** Override prompts per call via inbound webhook

**Prompt Structure:**
- System prompts
- User prompts
- Function descriptions
- Knowledge base context (if enabled)

**Example:**
```json
{
  "retell_llm": {
    "prompt": "You are a dental clinic receptionist...",
    "begin_message": "Hello, how can I help you?",
    "dynamic_variables": {
      "clinic_name": "{{clinic_name}}"
    }
  }
}
```

### Vapi

**Prompt Configuration:**
- **System Prompts:** Full control via `model.messages`
- **Assistant Overrides:** Per-assistant prompt configuration
- **Squad Members:** Each member can have different prompts
- **Dynamic Variables:** Support for template variables

**Example:**
```typescript
{
  model: {
    provider: "openai",
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a dental clinic receptionist..."
      }
    ]
  }
}
```

**Comparison:**
- **Tie** — Both support full prompt control
- **Retell** has more built-in prompt features (begin_message, dynamic variables)
- **Vapi** has more flexibility with message structure

---

## 9. API Endpoints

### Retell AI

**Key Endpoints:**

**Agents:**
- `POST /create-agent` — Create voice agent
- `GET /list-agents` — List all agents
- `GET /get-agent/{agent_id}` — Get agent details
- `PATCH /update-agent/{agent_id}` — Update agent
- `DELETE /delete-agent/{agent_id}` — Delete agent

**Calls:**
- `POST /v2/create-phone-call` — Create outbound call
- `POST /v2/create-web-call` — Create web call
- `GET /v2/get-call/{call_id}` — Get call details
- `POST /v2/list-calls` — List calls with filters

**Phone Numbers:**
- `POST /create-phone-number` — Purchase number
- `GET /list-phone-numbers` — List numbers
- `PATCH /update-phone-number/{phone_number_id}` — Update number

**LLMs:**
- `POST /create-retell-llm` — Create Retell LLM response engine
- `GET /get-retell-llm/{llm_id}` — Get LLM details

**Webhooks:**
- Configured per agent or account-level

### Vapi

**Key Endpoints:**

**Assistants:**
- `POST /assistant` — Create assistant
- `GET /assistant/{id}` — Get assistant
- `PATCH /assistant/{id}` — Update assistant
- `DELETE /assistant/{id}` — Delete assistant

**Squads:**
- `POST /squad` — Create squad
- `GET /squad/{id}` — Get squad
- `PATCH /squad/{id}` — Update squad
- `DELETE /squad/{id}` — Delete squad

**Calls:**
- `POST /call` — Create call
- `GET /call/{id}` — Get call details

**Phone Numbers:**
- `POST /phone-number` — Purchase number
- `GET /phone-number` — List numbers

**Webhooks:**
- Single webhook endpoint for all events

**Comparison:**
- **Retell** has more granular endpoints (separate web calls vs phone calls)
- **Vapi** has Squad-specific endpoints
- Both have similar CRUD operations for agents/assistants

---

## 10. Webhooks/Events

### Retell AI

**Webhook Events:**

**Voice Call Events:**
- `call_started` — When call begins
- `call_ended` — When call completes/transfers/errors
- `call_analyzed` — When call analysis completes
- `transcript_updated` — On turn-taking updates and final call end
- `transfer_started` — Transfer initiated
- `transfer_bridged` — Transfer connected
- `transfer_cancelled` — Transfer cancelled
- `transfer_ended` — Transfer completed

**Chat Events:**
- `chat_started` — When chat begins
- `chat_ended` — When chat completes/errors
- `chat_analyzed` — When chat analysis completes

**Inbound Events:**
- `call_inbound` — Inbound call webhook (before connection)
- `chat_inbound` — Inbound SMS webhook

**Webhook Configuration:**
- Per-agent or account-level
- Event filtering (`webhook_events` array)
- Timeout: 10 seconds (configurable)
- Retries: Up to 3 times
- Default events: `call_started`, `call_ended`, `call_analyzed`

**Webhook Payload Example:**
```json
{
  "event": "call_started",
  "call": {
    "call_id": "call_123",
    "from_number": "+12137771234",
    "to_number": "+12137771235",
    "direction": "inbound",
    "agent_id": "agent_12345"
  }
}
```

### Vapi

**Webhook Events:**

**Call Events:**
- `assistant-request` — When call starts (routing decision)
- `function-call` / `tool-calls` — Tool invocations
- `status-update` — Call status changes (ringing, in-progress, ended)
- `end-of-call-report` — Call completion with full transcript/analytics
- `speech-update` — Speech events
- `conversation-update` — Conversation state changes
- `transfer-destination-request` — Transfer requests

**Webhook Configuration:**
- Single webhook URL for all events
- Authentication: `X-Vapi-Secret` or `Authorization: Bearer`
- Event filtering via message type

**Webhook Payload Example:**
```json
{
  "message": {
    "type": "function-call",
    "call": {
      "id": "call_123",
      "customer": { "number": "+12137771234" },
      "phoneNumberId": "phone_123"
    },
    "functionCall": {
      "name": "bookAppointment",
      "parameters": { /* ... */ }
    }
  }
}
```

**Comparison:**
- **Retell** has more granular events (transfer events, analysis events)
- **Retell** has separate inbound webhook (more specialized)
- **Vapi** has simpler single webhook endpoint
- **Retell** has better event filtering options
- **Vapi** has `end-of-call-report` with full transcript (Retell has `call_analyzed`)

---

## Feature Gaps & Recommendations

### Retell AI Gaps (vs Vapi)

1. ❌ **No native Squad/multi-agent routing** — Must implement custom routing logic
2. ❌ **Custom LLM requires WebSocket server** — More complex than Vapi's HTTP-based approach
3. ⚠️ **Less developer control** — More opinionated platform
4. ⚠️ **Limited BYO providers** — Fewer options for STT/TTS providers

### Vapi Gaps (vs Retell)

1. ❌ **No built-in knowledge base** — Must implement yourself
2. ❌ **No warm transfer with context** — Transfer is more basic
3. ❌ **HIPAA compliance on enterprise only** — Retell includes on all plans
4. ⚠️ **More complex setup** — Code-first vs low-code
5. ⚠️ **Less transparent pricing** — Platform fee + add-ons vs flat rate

### Recommendations for Dental Clinic Use Case

**Choose Retell AI if:**
- You want quick setup (3-5 minutes)
- You need HIPAA compliance included
- You want built-in knowledge base for dental procedures
- You prefer transparent pricing ($0.07/min)
- You need warm transfers with context briefing
- You want medical vocabulary specialization for STT

**Choose Vapi if:**
- You need complex multi-agent routing (front-desk → scheduler → billing)
- You want to use custom LLM providers
- You need maximum developer control
- You want to bring your own STT/TTS providers
- You have existing Vapi infrastructure

**Hybrid Approach:**
- Use **Retell** for simpler clinics with single-agent workflows
- Use **Vapi** for complex multi-department clinics requiring Squad routing

---

## Pricing Comparison

### Retell AI
- **Voice:** $0.07/minute (all-inclusive)
- **Phone Numbers:** $2/month (US/Canada), $5/month (toll-free)
- **HIPAA/SOC 2/GDPR:** Included on all plans
- **Concurrent Calls:** 20 free concurrent calls
- **Uptime:** 99.99%

### Vapi
- **Voice:** $0.066/minute + $0.05/minute platform fee = $0.116/minute
- **Phone Numbers:** Varies by region
- **HIPAA:** Enterprise plans only ($1,000/month)
- **Slack Support:** $5,000/month (enterprise)
- **Concurrent Calls:** 10 free concurrent calls
- **Uptime:** 99.94%

**Cost Analysis (10,000 minutes/month):**
- **Retell:** $700/month
- **Vapi:** $1,160/month (base) + HIPAA ($1,000) = $2,160/month

**Retell is ~69% cheaper** for the same usage.

---

## Conclusion

Both platforms are capable of building a dental clinic receptionist, but they serve different needs:

- **Retell AI** is better for **rapid deployment, compliance, and cost efficiency**
- **Vapi** is better for **complex multi-agent workflows and maximum customization**

For a dental clinic receptionist, **Retell AI** is likely the better choice unless you specifically need Squad-based multi-agent routing.
