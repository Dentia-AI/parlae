# Retell AI API Details: Multi-Agent Routing, Custom Tools, and Integration Guide

## Table of Contents
1. [Multi-Agent/Squad Routing & Agent Transfer](#1-multi-agentsquad-routing--agent-transfer)
2. [Custom Functions/Tools API](#2-custom-functionstools-api)
3. [Create Agent API](#3-create-agent-api)
4. [Phone Number API](#4-phone-number-api)
5. [Webhook Events for Tool Calls](#5-webhook-events-for-tool-calls)

---

## 1. Multi-Agent/Squad Routing & Agent Transfer

### Overview

Retell AI supports **Agent Transfer** (also called **Agent Swap**) which allows switching between specialized AI agents during a single call without relying on traditional phone-based transfers. This is similar to Vapi's "squad" concept where multiple agents can hand off to each other.

### Key Advantages Over Traditional Call Transfer

- **No Separate Phone Numbers Needed**: Multiple agents can receive transfers through a single number
- **Full Conversation History Preserved**: The destination agent has access to the complete conversation, eliminating repeated customer questions
- **Better Reliability**: No new phone call creation needed, avoiding telephony failures
- **Near-Instant Transitions**: Significantly lower latency than traditional transfers

### Implementation Methods

#### Method 1: As a Tool (Recommended for Programmatic Setup)

Add an `agent_swap` tool to your agent's `general_tools` array in the Retell LLM configuration:

```json
{
  "type": "agent_swap",
  "name": "transfer_to_booking_agent",
  "description": "Transfer to the appointment booking agent when user wants to schedule an appointment",
  "agent_id": "oBeDLoLOeuAbiuaMFXRtDOLriTJ5tSxD",
  "agent_version": 1,
  "post_call_analysis_setting": {
    "type": "transferred_agent_only"  // or "both_agents"
  },
  "speak_during_execution": true,
  "execution_message_description": "I'm transferring you to our booking specialist now.",
  "execution_message_type": "prompt",  // or "static_text"
  "webhook_setting": {
    "type": "only_source"  // or "only_destination" or "both"
  },
  "keep_current_voice": false
}
```

#### Method 2: As a Flow Node (Conversation Flow Builder)

In Retell's conversation flow builder, select "Agent Transfer" from the 'Add New Node' menu.

### Agent Swap Tool Schema

**Required Fields:**
- `type`: `"agent_swap"`
- `name`: Unique tool name (a-z, A-Z, 0-9, underscores, dashes, max 64 chars)
- `agent_id`: The ID of the agent to transfer to
- `post_call_analysis_setting`: Configuration for post-call analysis

**Optional Fields:**
- `agent_version`: Specific version (defaults to latest if not specified)
- `speak_during_execution`: Boolean - whether agent speaks during transfer
- `execution_message_description`: Message to speak during transfer
- `execution_message_type`: `"prompt"` or `"static_text"`
- `webhook_setting`: Which agent receives webhooks (`only_source`, `only_destination`, `both`)
- `keep_current_voice`: Boolean - whether to keep the current voice when swapping

### Post Call Analysis Settings

```json
{
  "post_call_analysis_setting": {
    "type": "transferred_agent_only"  // Options: "transferred_agent_only" | "both_agents"
  }
}
```

### Transfer Settings Behavior

The following settings from the **first agent** persist throughout the call:
- `webhook_url`
- `opt_out_sensitive_data_storage` / `data_storage_setting`
- `opt_in_signed_url`

All other settings (language, voice, voiceModel, etc.) reflect the **currently active agent**.

### Prompt Configuration

Update your agent's prompt to explicitly instruct when to use agent transfer:

```
If the user asks to book an appointment, use the agent_transfer tool to transfer 
to the Appointment Booking Agent (agent_id: oBeDLoLOeuAbiuaMFXRtDOLriTJ5tSxD).

If the user needs help with insurance or billing questions, transfer to the 
Insurance/Billing Agent (agent_id: abc123...).
```

### Multi-Agent Squad Architecture Example

For a 6-agent squad similar to Vapi:

1. **Receptionist Agent** (entry point)
   - Routes to: Booking, Appointment Management, Patient Records, Insurance/Billing, Emergency
   
2. **Booking Agent**
   - Handles new appointment scheduling
   - Can transfer back to Receptionist

3. **Appointment Management Agent**
   - Handles rescheduling, cancellations, modifications
   
4. **Patient Records Agent**
   - Handles record lookups and updates
   
5. **Insurance/Billing Agent**
   - Handles insurance verification and billing questions
   
6. **Emergency Agent**
   - Handles urgent medical situations

**Implementation:**
- Create 6 separate agents, each with specialized prompts
- Add `agent_swap` tools to each agent's `general_tools` array
- Configure routing logic in each agent's prompt
- All agents can share the same phone number

---

## 2. Custom Functions/Tools API

### Overview

Custom functions allow you to extend your agent's capabilities by integrating external APIs, providing additional knowledge, or implementing custom logic.

### Tool Definition Schema

```json
{
  "type": "custom",
  "name": "get_user_details",
  "description": "Get user details based on name and age",
  "url": "https://your-api.com/get-user",
  "method": "POST",  // GET, POST, PUT, PATCH, DELETE
  "headers": {
    "Authorization": "Bearer {{api_token}}",
    "Content-Type": "application/json"
  },
  "query_params": {
    "page": "1",
    "sort": "asc"
  },
  "parameters": {
    "type": "object",
    "required": ["order_id"],
    "properties": {
      "name": {
        "type": "object",
        "properties": {
          "first_name": {
            "type": "string",
            "description": "User first name"
          },
          "last_name": {
            "type": "string",
            "const": "{{last_name}}"
          }
        }
      },
      "order_id": {
        "type": "number",
        "const": 1234
      }
    }
  },
  "response_variables": {
    "user_name": "data.user.name",
    "user_age": "data.user.age"
  },
  "speak_during_execution": true,
  "speak_after_execution": true,
  "execution_message_description": "One moment, let me check that for you.",
  "execution_message_type": "prompt",  // or "static_text"
  "timeout_ms": 120000,  // 2 minutes default, max 600000 (10 min)
  "args_at_root": false  // If true, parameters passed as root-level JSON
}
```

### Parameter Schema Details

- **Type**: Must be `"object"` at the top level
- **Required**: Array of required parameter names
- **Properties**: Object defining each parameter
  - `type`: Data type (string, number, boolean, object, array)
  - `description`: Description for LLM (resolved by LLM)
  - `const`: Static value (applied directly)
  - Dynamic variables: Use `{{variable_name}}` format

### Webhook Request Payload (When Function is Called)

When Retell calls your custom function endpoint, it sends:

```json
{
  "name": "get_user_details",
  "args": {
    "name": {
      "first_name": "John",
      "last_name": "Doe"
    },
    "order_id": 1234
  },
  "call": {
    "call_id": "Jabr9TXYYJHfvl6Syypi88rdAHYHmcq6",
    "call_type": "phone_call",
    "from_number": "+12137771234",
    "to_number": "+12137771235",
    "direction": "inbound",
    "agent_id": "oBeDLoLOeuAbiuaMFXRtDOLriTJ5tSxD",
    "transcript": "...",
    "transcript_object": [...],
    "metadata": {},
    "retell_llm_dynamic_variables": {
      "customer_name": "John Doe"
    }
    // ... full call object (see Get Call API)
  }
}
```

**Headers:**
- `Content-Type`: `application/json`
- `X-Retell-Signature`: Encrypted request body for verification

**Note**: For GET and DELETE requests, the request body is empty (use empty string for signature verification).

### Response Format

Your endpoint should return a status code between 200-299. Response can be:
- JSON object
- Blob
- Buffer
- String

All formats are converted to string before sending to LLM.

**Response Variable Extraction:**
```json
{
  "data": {
    "user": {
      "name": "John Doe",
      "age": 26
    }
  }
}
```

With `response_variables` configured as:
```json
{
  "response_variables": {
    "user_name": "data.user.name",
    "user_age": "data.user.age"
  }
}
```

These values become available as `{{user_name}}` and `{{user_age}}` in subsequent prompts.

### Request Timeout & Retries

- **Timeout**: Configurable via `timeout_ms` (default: 120,000 ms / 2 minutes)
- **Retries**: Up to 2 retries on failure
- **Response Size Limit**: Function result capped at 15,000 characters

### Signature Verification

```typescript
import { Retell } from "retell-sdk";

app.post("/check-weather", async (req: Request, res: Response) => {
  if (
    !Retell.verify(
      JSON.stringify(req.body),
      process.env.RETELL_API_KEY,
      req.headers["x-retell-signature"] as string,
    )
  ) {
    console.error("Invalid signature");
    return res.status(401).send();
  }
  
  const { args, call } = req.body;
  // Process function call...
  return res.json({ result: "25f and sunny" });
});
```

**Python Example:**
```python
from retell import Retell

@app.post("/check-weather")
async def check_weather(request: Request):
    post_data = await request.json()
    valid_signature = retell.verify(
        json.dumps(post_data, separators=(",", ":"), ensure_ascii=False),
        api_key=str(os.environ["RETELL_API_KEY"]),
        signature=str(request.headers.get("X-Retell-Signature")),
    )
    if not valid_signature:
        return JSONResponse(status_code=401, content={"message": "Unauthorized"})
    
    args = post_data["args"]
    return JSONResponse(status_code=200, content={"result": "25f and sunny"})
```

### IP Allowlisting

You can also secure your server by only allowing Retell IP addresses: `100.20.5.228`

---

## 3. Create Agent API

### Endpoint

```
POST https://api.retellai.com/create-agent
```

### Required Fields

```json
{
  "response_engine": {
    "type": "retell-llm",
    "llm_id": "llm_234sdertfsdsfsdf",
    "version": 0
  },
  "voice_id": "11labs-Adrian"
}
```

### Complete Agent Creation Payload

```json
{
  "response_engine": {
    "type": "retell-llm",
    "llm_id": "llm_234sdertfsdsfsdf",
    "version": 0
  },
  "agent_name": "Receptionist Agent",
  "version_description": "Customer support agent for handling product inquiries",
  "voice_id": "11labs-Adrian",
  "voice_model": "eleven_turbo_v2",
  "fallback_voice_ids": ["cartesia-Cimo", "minimax-Cimo"],
  "voice_temperature": 1,
  "voice_speed": 1,
  "enable_dynamic_voice_speed": true,
  "volume": 1,
  "voice_emotion": "calm",
  "responsiveness": 1,
  "interruption_sensitivity": 1,
  "enable_backchannel": true,
  "backchannel_frequency": 0.9,
  "backchannel_words": ["yeah", "uh-huh"],
  "language": "en-US",
  "webhook_url": "https://webhook-url-here",
  "webhook_events": [
    "call_started",
    "call_ended",
    "call_analyzed",
    "transcript_updated",
    "transfer_started",
    "transfer_bridged",
    "transfer_cancelled",
    "transfer_ended"
  ],
  "webhook_timeout_ms": 10000,
  "boosted_keywords": ["retell", "kroger"],
  "data_storage_setting": "everything",
  "data_storage_retention_days": 30,
  "opt_in_signed_url": true,
  "signed_url_expiration_ms": 86400000,
  "pronunciation_dictionary": [
    {
      "word": "actually",
      "alphabet": "ipa",
      "phoneme": "ˈæktʃuəli"
    }
  ],
  "normalize_for_speech": true,
  "end_call_after_silence_ms": 600000,
  "max_call_duration_ms": 3600000,
  "enable_voicemail_detection": true,
  "voicemail_message": "Hi, please give us a callback.",
  "voicemail_detection_timeout_ms": 30000,
  "voicemail_option": {
    "action": {
      "type": "static_text",
      "text": "Please give us a callback tomorrow at 10am."
    }
  },
  "ivr_option": {
    "action": {
      "type": "hangup"
    }
  },
  "post_call_analysis_data": [
    {
      "type": "string",
      "name": "customer_satisfaction",
      "description": "Customer satisfaction rating"
    }
  ],
  "post_call_analysis_model": "gpt-4.1-mini",
  "analysis_successful_prompt": "The agent finished the task and the call was complete without being cutoff.",
  "analysis_summary_prompt": "Summarize the outcome of the conversation in two sentences.",
  "analysis_user_sentiment_prompt": "Evaluate the user's sentiment based on their tone and satisfaction level.",
  "begin_message_delay_ms": 1000,
  "ring_duration_ms": 30000,
  "stt_mode": "fast",
  "custom_stt_config": {
    "provider": "azure",
    "endpointing_ms": 100
  },
  "vocab_specialization": "general",
  "allow_user_dtmf": true,
  "user_dtmf_options": {
    "digit_limit": 10,
    "termination_key": "#",
    "timeout_ms": 5000
  },
  "denoising_mode": "noise-cancellation",
  "pii_config": {
    // PII scrubbing configuration
  },
  "guardrail_config": {
    // Guardrail configuration
  },
  "is_public": false
}
```

### Create Retell LLM (Response Engine)

Before creating an agent, you need to create a Retell LLM Response Engine:

```
POST https://api.retellai.com/create-retell-llm
```

**Payload:**
```json
{
  "general_prompt": "You are a helpful receptionist assistant...",
  "general_tools": [
    {
      "type": "agent_swap",
      "name": "transfer_to_booking",
      "description": "Transfer to booking agent",
      "agent_id": "agent_booking_id",
      "post_call_analysis_setting": {
        "type": "transferred_agent_only"
      }
    },
    {
      "type": "custom",
      "name": "check_appointment_availability",
      "description": "Check available appointment slots",
      "url": "https://api.example.com/check-availability",
      "method": "POST",
      "parameters": {
        "type": "object",
        "required": ["date"],
        "properties": {
          "date": {
            "type": "string",
            "description": "Date to check availability"
          }
        }
      }
    }
  ],
  "states": [
    {
      "name": "information_collection",
      "state_prompt": "You will follow the steps below to collect information...",
      "edges": [
        {
          "destination_state_name": "appointment_booking",
          "description": "Transition to book an appointment."
        }
      ],
      "tools": [
        {
          "type": "transfer_call",
          "name": "transfer_to_support",
          "description": "Transfer to the support team."
        }
      ]
    },
    {
      "name": "appointment_booking",
      "state_prompt": "You will follow the steps below to book an appointment...",
      "tools": [
        {
          "type": "book_appointment_cal",
          "name": "book_appointment",
          "description": "Book an annual check up.",
          "cal_api_key": "cal_live_xxxxxxxxxxxx",
          "event_type_id": 60444,
          "timezone": "America/Los_Angeles"
        }
      ]
    }
  ],
  "starting_state": "information_collection",
  "default_dynamic_variables": {
    "customer_name": "John Doe"
  },
  "model": "gpt-4.1",
  "model_temperature": 0,
  "model_high_priority": false,
  "tool_call_strict_mode": true,
  "knowledge_base_ids": ["kb_123"],
  "kb_config": {
    "top_k": 3,
    "filter_score": 0.6
  },
  "start_speaker": "agent",
  "begin_after_user_silence_ms": 2000,
  "begin_message": "Hey I am a virtual assistant calling from Retell Hospital."
}
```

### Response

```json
{
  "agent_id": "oBeDLoLOeuAbiuaMFXRtDOLriTJ5tSxD",
  "version": 0,
  "is_published": false,
  "last_modification_timestamp": 1703413636133,
  // ... all other agent configuration fields
}
```

---

## 4. Phone Number API

### Import Phone Number

```
POST https://api.retellai.com/import-phone-number
```

**Payload:**
```json
{
  "phone_number": "+14157774444",
  "termination_uri": "someuri.pstn.twilio.com",
  "inbound_agent_id": "oBeDLoLOeuAbiuaMFXRtDOLriTJ5tSxD",
  "outbound_agent_id": "oBeDLoLOeuAbiuaMFXRtDOLriTJ5tSxD",
  "inbound_agent_version": 1,
  "outbound_agent_version": 1,
  "sip_trunk_auth_username": "username",
  "sip_trunk_auth_password": "password",
  "inbound_agents": [
    {
      "agent_id": "agent_receptionist_id",
      "agent_version": 1,
      "weight": 0.5
    },
    {
      "agent_id": "agent_booking_id",
      "agent_version": 1,
      "weight": 0.5
    }
  ],
  "outbound_agents": [
    {
      "agent_id": "agent_receptionist_id",
      "agent_version": 1,
      "weight": 1.0
    }
  ],
  "inbound_webhook_url": "https://example.com/inbound-webhook",
  "inbound_sms_webhook_url": "https://example.com/inbound-sms-webhook",
  "nickname": "Frontdesk Number",
  "allowed_inbound_country_list": ["US", "CA", "GB"],
  "allowed_outbound_country_list": ["US", "CA"],
  "fallback_number": "+14155551234"
}
```

**Note**: The `inbound_agent_id` and `outbound_agent_id` fields are deprecated. Use `inbound_agents` and `outbound_agents` arrays with weights instead.

### List Phone Numbers

```
GET https://api.retellai.com/list-phone-numbers
```

**Response:**
```json
[
  {
    "phone_number": "+14157774444",
    "phone_number_type": "retell-twilio",
    "phone_number_pretty": "+1 (415) 777-4444",
    "inbound_agent_id": "oBeDLoLOeuAbiuaMFXRtDOLriTJ5tSxD",
    "outbound_agent_id": "oBeDLoLOeuAbiuaMFXRtDOLriTJ5tSxD",
    "inbound_agent_version": 1,
    "outbound_agent_version": 1,
    "inbound_agents": [
      {
        "agent_id": "agent_receptionist_id",
        "agent_version": 1,
        "weight": 0.5
      }
    ],
    "outbound_agents": [
      {
        "agent_id": "agent_receptionist_id",
        "agent_version": 1,
        "weight": 1.0
      }
    ],
    "nickname": "Frontdesk Number",
    "allowed_inbound_country_list": ["US", "CA"],
    "allowed_outbound_country_list": ["US"],
    "inbound_webhook_url": "https://example.com/inbound-webhook",
    "inbound_sms_webhook_url": "https://example.com/inbound-sms-webhook",
    "last_modification_timestamp": 1703413636133,
    "sip_outbound_trunk_config": {
      "termination_uri": "someuri.pstn.twilio.com",
      "auth_username": "username",
      "transport": "TCP"
    },
    "fallback_number": "+14155551234"
  }
]
```

### Agent Weighted Routing

You can configure multiple agents per phone number with weighted routing:

```json
{
  "inbound_agents": [
    {
      "agent_id": "agent_receptionist_id",
      "agent_version": 1,
      "weight": 0.6
    },
    {
      "agent_id": "agent_booking_id",
      "agent_version": 1,
      "weight": 0.4
    }
  ]
}
```

Total weights must add up to 1.0. Agents are picked randomly with probability proportional to weight.

---

## 5. Webhook Events for Tool Calls

### Event Types

Retell AI supports the following webhook events:

**Voice Call Events:**
- `call_started` - When a new call begins
- `call_ended` - When a call completes, transfers, or encounters an error
- `call_analyzed` - When call analysis is complete
- `transcript_updated` - On turn-taking transcript updates and final update when call ends (includes `transcript_with_tool_calls`)
- `transfer_started` - When a transfer is initiated
- `transfer_bridged` - When a transfer successfully bridges
- `transfer_cancelled` - When a transfer is cancelled or fails
- `transfer_ended` - When the transfer leg ends

**Chat Events:**
- `chat_started`
- `chat_ended`
- `chat_analyzed`

### Webhook Payload Structure

```json
{
  "event": "transcript_updated",
  "call": {
    "call_type": "phone_call",
    "from_number": "+12137771234",
    "to_number": "+12137771235",
    "direction": "inbound",
    "call_id": "Jabr9TXYYJHfvl6Syypi88rdAHYHmcq6",
    "agent_id": "oBeDLoLOeuAbiuaMFXRtDOLriTJ5tSxD",
    "call_status": "registered",
    "metadata": {},
    "retell_llm_dynamic_variables": {
      "customer_name": "John Doe"
    },
    "start_timestamp": 1714608475945,
    "end_timestamp": 1714608491736,
    "disconnection_reason": "user_hangup",
    "transcript": "...",
    "transcript_object": [
      {
        "role": "agent",
        "content": "Hello, how can I help you?",
        "timestamp": 1714608476000
      },
      {
        "role": "user",
        "content": "I'd like to book an appointment",
        "timestamp": 1714608480000
      }
    ],
    "transcript_with_tool_calls": [
      {
        "role": "agent",
        "content": "Hello, how can I help you?",
        "timestamp": 1714608476000
      },
      {
        "role": "user",
        "content": "I'd like to book an appointment",
        "timestamp": 1714608480000
      },
      {
        "role": "agent",
        "content": "I'll check availability for you.",
        "timestamp": 1714608481000,
        "tool_calls": [
          {
            "tool_call_id": "call_abc123",
            "tool_name": "check_appointment_availability",
            "tool_type": "custom",
            "arguments": {
              "date": "2024-01-15"
            },
            "status": "completed",
            "result": "Available slots: 10am, 2pm, 4pm"
          }
        ]
      }
    ],
    "opt_out_sensitive_data_storage": false
  }
}
```

### Tool Call Information in Transcript

The `transcript_with_tool_calls` field includes detailed information about tool calls:

```json
{
  "role": "agent",
  "content": "I'll check that for you.",
  "timestamp": 1714608481000,
  "tool_calls": [
    {
      "tool_call_id": "call_abc123",
      "tool_name": "check_appointment_availability",
      "tool_type": "custom",  // or "agent_swap", "transfer_call", etc.
      "arguments": {
        "date": "2024-01-15"
      },
      "status": "completed",  // or "failed", "timeout"
      "result": "Available slots: 10am, 2pm, 4pm"
    }
  ]
}
```

### Transfer Event Payload

```json
{
  "event": "transfer_started",
  "call": {
    "call_id": "Jabr9TXYYJHfvl6Syypi88rdAHYHmcq6",
    // ... full call object
  },
  "transfer_destination": {
    "number": "+12137771235",
    "extension": "1234"
  },
  "transfer_option": {
    "type": "warm_transfer",
    "show_transferee_as_caller": true,
    "public_handoff_option": {
      "type": "static_message",
      "message": "Hi, I am transferring the caller now."
    },
    "agent_detection_timeout_ms": 15000,
    "on_hold_music": {
      "type": "default"
    },
    "enable_bridge_audio_cue": true
  }
}
```

### Agent Swap Event

When an `agent_swap` tool is called, you'll receive webhook events based on the `webhook_setting`:
- `only_source`: Only the source agent receives webhooks
- `only_destination`: Only the destination agent receives webhooks
- `both`: Both agents receive webhooks

### Webhook Configuration

**Agent-Level:**
```json
{
  "webhook_url": "https://your-webhook.com/events",
  "webhook_events": [
    "call_started",
    "call_ended",
    "call_analyzed",
    "transcript_updated",
    "transfer_started",
    "transfer_bridged",
    "transfer_cancelled",
    "transfer_ended"
  ],
  "webhook_timeout_ms": 10000
}
```

**Default Events:**
- Voice agents: `call_started`, `call_ended`, `call_analyzed`
- Chat agents: `chat_started`, `chat_ended`, `chat_analyzed`

### Webhook Spec

- **Method**: POST
- **Timeout**: 10 seconds
- **Retries**: Up to 3 times if no 2xx status received
- **Order**: Events triggered in order but non-blocking
- **Headers**: 
  - `Content-Type: application/json`
  - `X-Retell-Signature`: Encrypted request body for verification

### Signature Verification

```typescript
import { Retell } from "retell-sdk";

app.post("/webhook", (req: Request, res: Response) => {
  if (
    !Retell.verify(
      JSON.stringify(req.body),
      process.env.RETELL_API_KEY,
      req.headers["x-retell-signature"] as string,
    )
  ) {
    console.error("Invalid signature");
    return res.status(401).send();
  }
  
  const { event, call } = req.body;
  
  if (event === "transcript_updated") {
    // Process transcript with tool calls
    const toolCalls = call.transcript_with_tool_calls
      .flatMap(turn => turn.tool_calls || []);
    
    toolCalls.forEach(toolCall => {
      console.log(`Tool: ${toolCall.tool_name}`);
      console.log(`Status: ${toolCall.status}`);
      console.log(`Result: ${toolCall.result}`);
    });
  }
  
  res.status(204).send();
});
```

---

## Summary: Retell vs Vapi Squad Architecture

### Retell AI Approach

1. **Agent Transfer**: Use `agent_swap` tool to transfer between agents
2. **Single Phone Number**: All agents can share one number
3. **Full History**: Destination agent receives complete conversation context
4. **Custom Tools**: Define custom functions with JSON schema parameters
5. **Webhook Events**: Real-time events including `transcript_with_tool_calls`

### Key Differences from Vapi

- **Tool-Based Transfer**: Retell uses tools (`agent_swap`) rather than a separate squad routing system
- **Explicit Configuration**: Each agent explicitly defines which other agents it can transfer to
- **No Central Router**: No single "squad" controller; each agent handles its own routing logic
- **Webhook Flexibility**: Can configure which agent receives webhooks during transfer

### Migration Considerations

To migrate a Vapi squad to Retell:

1. Create separate agents for each squad member
2. Add `agent_swap` tools to each agent's `general_tools`
3. Configure routing logic in each agent's prompt
4. Use `transcript_updated` webhooks to track tool calls and transfers
5. Leverage `post_call_analysis_setting` to control analysis scope

---

## Additional Resources

- [Retell AI Documentation](https://docs.retellai.com)
- [API Reference](https://docs.retellai.com/api-references)
- [SDKs](https://docs.retellai.com/get-started/sdk)
- [Custom Functions Guide](https://docs.retellai.com/build/single-multi-prompt/custom-function)
- [Agent Transfer Guide](https://docs.retellai.com/build/single-multi-prompt/transfer-agent)
