/**
 * Creates a test squad by cloning the production squad and injecting
 * updated prompt sections. This allows iterating on prompts without
 * deploying the full application.
 *
 * Usage:
 *   VAPI_API_KEY=... VAPI_SQUAD_ID=... npx tsx create-test-squad.ts [create|delete|update]
 *   VAPI_API_KEY=... VAPI_SQUAD_ID=... npx tsx create-test-squad.ts create --model gpt-4.1
 *
 * Commands:
 *   create  - Clone prod squad with updated prompts (default)
 *   update  - Update existing test squad prompts in-place
 *   delete  - Delete the test squad
 *
 * Options:
 *   --model <name>  Override the LLM model for all members (e.g. gpt-4.1, gpt-4o, gpt-5.2-chat-latest)
 *   --suffix <tag>  Custom suffix for the squad name
 */

const VAPI_API_KEY = process.env.VAPI_API_KEY!;
const SOURCE_SQUAD_ID = process.env.VAPI_SQUAD_ID!;
const VAPI_BASE = 'https://api.vapi.ai';

// CLI arg parsing
const cliArgs = process.argv.slice(2);
function getCliArg(flag: string): string | undefined {
  const idx = cliArgs.indexOf(flag);
  return idx >= 0 && idx + 1 < cliArgs.length ? cliArgs[idx + 1] : undefined;
}
const MODEL_OVERRIDE = getCliArg('--model');
const NAME_SUFFIX = getCliArg('--suffix');

// File to persist the test squad ID between runs
import * as fs from 'fs';
import * as path from 'path';
const stateFileSuffix = MODEL_OVERRIDE ? `-${MODEL_OVERRIDE.replace(/[^a-z0-9.-]/gi, '_')}` : '';
const STATE_FILE = path.join(__dirname, `_test-squad-id${stateFileSuffix}.txt`);

// ---------------------------------------------------------------------------
// Updated prompt sections
// ---------------------------------------------------------------------------

const UPDATED_CONVERSATION_FLOW = `## CONVERSATION FLOW — CRITICAL
You are on a live phone call. The caller expects a natural, continuous conversation. Follow these rules at ALL times:

1. **NEVER go silent.** After every tool call — success or failure — you MUST immediately speak. Silence loses the caller.
2. **Read tool results carefully.** Results prefixed with [SUCCESS] mean the action completed. Results prefixed with [ERROR] mean it failed.
3. **On [ERROR]: STOP and fix.** Do NOT continue to the next step. Do NOT say the action was completed. The error tells you what is missing — ask the caller for it, then retry the SAME tool. Example: if createPatient returns [ERROR] saying phone is required, ask "Could I also get your phone number?" and retry createPatient with the phone number.
4. **On [SUCCESS]: move to the next step IMMEDIATELY.** If the result contains [NEXT STEP], follow that instruction RIGHT NOW — call the next tool without speaking to the caller first.
5. **NEVER HALLUCINATE RESULTS.** If a tool returned [ERROR], that action FAILED — do not tell the caller it succeeded. If you never called a tool (e.g., bookAppointment), do not tell the caller the action was done. You may ONLY confirm an action if the tool returned [SUCCESS].
6. **Action filler is OK; result narration is NOT.** Saying "Let me check on that" or "One moment while I look that up" is GOOD — it tells the caller you're working. But announcing tool results like "I've created your profile" or "I found your record" is BAD — it makes you yield the floor and the caller has nothing to say back, causing dead air. Instead, chain directly to the next tool.
7. **You lead the conversation.** After completing each action, proactively move forward or ask "Is there anything else I can help you with?"
8. **INVISIBLE HANDOFFS.** When calling any handoff tool, say ONLY a brief natural phrase (e.g., "Sure, I can help with that"). NEVER mention agent names, transfers, connections, specialists, or teams.
9. **NO PLACEHOLDER VALUES.** Never pass template variables like "{{call.customer.number}}" or "{{now}}" as tool arguments. Only pass real values (actual phone digits, actual names, actual dates). If you don't have a value, ask the caller for it.
10. **SPEAK DATES NATURALLY.** Never read raw date formats like "2026-02-22" or "2026-02-22T14:00:00Z". Always say dates as spoken English: "today", "tomorrow", "February 22nd", "Monday the 23rd", etc. For times, say "2 PM" not "14:00".
11. **CHAIN TOOL CALLS — NEVER PAUSE BETWEEN THEM.** When a tool result includes [NEXT STEP], your very next action MUST be calling that tool. You may say brief filler like "Great, let me book that for you" but you MUST call the tool in the same turn. NEVER make a result statement and stop (e.g., "I've created your profile." then silence). If you must speak, end with a forward action phrase and immediately call the next tool.
12. **[FALLBACK] means TRANSFER NOW.** If any tool response contains [FALLBACK], stop retrying. Use the transferCall tool immediately to connect the caller with clinic staff. Say something like: "Let me connect you with our front desk." Do NOT attempt further tool calls.`;

const UPDATED_BOOKING_WORKFLOW = `## WORKFLOW — FOLLOW THIS ORDER EXACTLY
1. Ask what type of appointment and preferred date (skip if caller already stated both).
2. Call **checkAvailability** → present available slots. Do NOT collect patient info yet.
3. Caller picks a time.
4. NOW collect patient info: ask for their name (have them spell it), email (have them spell it), and phone number if unknown.
5. Call **lookupPatient** with name or phone. If FOUND → confirm identity, continue to step 7.
6. If NOT FOUND → call **createPatient** with firstName, lastName, email, phone. On [SUCCESS], you MAY say a brief phrase like "Great, let me book that for you" but you MUST call **bookAppointment** as your very next action. NEVER say "I've created your profile" and stop — that causes dead air. Go straight to step 7.
7. Call **bookAppointment** with the patientId from step 5 or 6. Wait for [SUCCESS] before telling the caller they're booked.
8. ONLY after **bookAppointment** returns [SUCCESS]: confirm the booking using natural spoken dates (e.g., "today at 2 PM" or "February 23rd at 9 AM"). Do NOT read raw dates like "2026-02-22". Then ask "Anything else?"

## CRITICAL — TOOL CHAINING
When one tool succeeds and the next step requires another tool call, do it IMMEDIATELY. You may say brief action filler ("One moment", "Let me get that booked") to keep the caller informed, but you MUST call the next tool right away. NEVER announce a tool result ("I've created your profile", "I found your record") and then stop — this causes silence because the caller has nothing to respond to.`;

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function vapiRequest(method: string, path: string, body?: any): Promise<any> {
  const url = `${VAPI_BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch(url, opts);
    if (resp.ok) return resp.json();
    if (resp.status === 429) {
      const wait = 2000 * (attempt + 1);
      console.log(`  Rate limited, waiting ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const text = await resp.text();
    throw new Error(`Vapi ${method} ${path} (${resp.status}): ${text.substring(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Prompt patching
// ---------------------------------------------------------------------------

function patchUniversalPrompt(prompt: string): string {
  // Replace the existing CONVERSATION FLOW section if present
  const flowRegex = /## CONVERSATION FLOW — CRITICAL[\s\S]*?(?=\n## (?!CONVERSATION)|\n\n## LANGUAGE)/;
  if (flowRegex.test(prompt)) {
    return prompt.replace(flowRegex, UPDATED_CONVERSATION_FLOW + '\n');
  }
  // If not found, append before ## LANGUAGE or at the end
  const langIdx = prompt.indexOf('## LANGUAGE');
  if (langIdx >= 0) {
    return prompt.substring(0, langIdx) + UPDATED_CONVERSATION_FLOW + '\n\n' + prompt.substring(langIdx);
  }
  return prompt + '\n\n' + UPDATED_CONVERSATION_FLOW;
}

function patchBookingWorkflow(prompt: string): string {
  // Strategy 1: New template format (## WORKFLOW — FOLLOW THIS ORDER EXACTLY)
  const workflowRegex = /## WORKFLOW — FOLLOW THIS ORDER EXACTLY[\s\S]*?## CRITICAL — (?:NO PAUSING BETWEEN TOOL CALLS|TOOL CHAINING)[\s\S]*?(?=\n## APPOINTMENT TYPES)/;
  if (workflowRegex.test(prompt)) {
    return prompt.replace(workflowRegex, UPDATED_BOOKING_WORKFLOW + '\n\n');
  }

  // Strategy 2: Deployed format (## NEW PATIENT FLOW + ## APPOINTMENT BOOKING FLOW step 4)
  let patched = prompt;

  // Patch NEW PATIENT FLOW step 6
  const oldStep6 = '6. **IMPORTANT: Immediately continue to book the appointment — do NOT pause. Call bookAppointment with patientId, firstName, lastName, email, phone, appointmentType, startTime, duration, notes.**';
  const newStep6 = `6. **CRITICAL: Call bookAppointment IMMEDIATELY — DO NOT WAIT FOR CALLER INPUT.** After createPatient returns success, your VERY NEXT ACTION must be calling bookAppointment. Do not say "I've created your profile." Do not ask the caller anything. Do not narrate. Just call bookAppointment with patientId, firstName, lastName, email, phone, appointmentType, startTime, duration. If you need to speak, say only "Let me book that for you now" and call the tool in the same turn.`;
  patched = patched.replace(oldStep6, newStep6);

  // Patch APPOINTMENT BOOKING FLOW step 4 createPatient subsection
  const oldCreatePatientNote = 'After createPatient succeeds, immediately continue to booking — do NOT pause.';
  const newCreatePatientNote = 'After createPatient succeeds, call bookAppointment IMMEDIATELY in your VERY NEXT ACTION. Do NOT announce "profile created", do NOT wait for the caller to speak, do NOT ask any questions — go straight to bookAppointment.';
  patched = patched.replace(oldCreatePatientNote, newCreatePatientNote);

  // Patch APPOINTMENT BOOKING FLOW step 6 (Book)
  const oldBookStep = '6. **Book** — Call **bookAppointment**. For new patients include firstName, lastName, email, phone. For existing patients, include them if you confirmed/updated them. After booking succeeds, immediately tell the caller the confirmation details — do NOT wait for them to respond.';
  const newBookStep = '6. **Book** — Call **bookAppointment**. For new patients include firstName, lastName, email, phone. For existing patients, include them if you confirmed/updated them. After booking succeeds, immediately tell the caller the confirmation details using natural spoken dates (e.g., "today at 2 PM", "February 23rd"). Do NOT wait for them to respond before confirming.';
  patched = patched.replace(oldBookStep, newBookStep);

  // Add explicit self-continuation instruction before ERROR HANDLING
  const errorHandlingIdx = patched.indexOf('## ERROR HANDLING');
  if (errorHandlingIdx >= 0) {
    const selfContinue = `## SELF-CONTINUATION — CRITICAL
After any successful tool call, you MUST take the next action without waiting for caller input. The tool chain is: checkAvailability → lookupPatient → createPatient → bookAppointment. After each tool returns [SUCCESS], immediately call the next tool in the chain. Only speak to the caller when you need information you don't have, or when bookAppointment returns [SUCCESS] and you need to confirm the booking.

If the caller asks an off-topic question (e.g., insurance, hours, location) while you are mid-booking, briefly acknowledge it ("I can look into that after we finish booking") and CONTINUE the booking flow. Complete the booking FIRST, then address the side question. Never let a side question break the tool chain.

## FALLBACK — HUMAN TRANSFER
If any tool response contains [FALLBACK], STOP retrying tools. Immediately use the **transferCall** tool to connect the caller with clinic staff. Say: "Let me connect you with our front desk so they can help you directly." Do NOT attempt any more booking tool calls after receiving [FALLBACK].

`;
    patched = patched.substring(0, errorHandlingIdx) + selfContinue + patched.substring(errorHandlingIdx);
  }

  return patched;
}

function isBookingAgent(prompt: string): boolean {
  return prompt.includes('scheduling coordinator') && prompt.includes('bookAppointment');
}

function patchMemberPrompts(members: any[], modelOverride?: string): any[] {
  return members.map((m) => {
    const msg = m.assistantOverrides?.model?.messages?.[0];
    if (!msg?.content) return m;

    let content = msg.content;
    content = patchUniversalPrompt(content);
    if (isBookingAgent(content)) {
      content = patchBookingWorkflow(content);
    }

    const modelConfig = {
      ...m.assistantOverrides.model,
      messages: [{ ...msg, content }],
    };

    if (modelOverride) {
      modelConfig.model = modelOverride;
    }

    return {
      ...m,
      assistantOverrides: {
        ...m.assistantOverrides,
        model: modelConfig,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function createTestSquad(): Promise<string> {
  console.log('Fetching source squad:', SOURCE_SQUAD_ID);
  const squad = await vapiRequest('GET', `/squad/${SOURCE_SQUAD_ID}`);

  console.log(`Source squad: "${squad.name}" with ${squad.members.length} members`);
  if (MODEL_OVERRIDE) {
    console.log(`Model override: ${MODEL_OVERRIDE}`);
  }

  const patchedMembers = patchMemberPrompts(squad.members, MODEL_OVERRIDE);

  const nameParts = ['TEST'];
  if (MODEL_OVERRIDE) nameParts.push(MODEL_OVERRIDE);
  if (NAME_SUFFIX) nameParts.push(NAME_SUFFIX);
  nameParts.push(new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19));

  // Strip read-only fields
  const payload = {
    name: nameParts.join('-'),
    members: patchedMembers.map((m: any) => {
      const { id, createdAt, updatedAt, orgId, ...rest } = m;
      return rest;
    }),
    membersOverrides: squad.membersOverrides,
  };

  console.log('Creating test squad...');
  const result = await vapiRequest('POST', '/squad', payload);
  console.log(`Test squad created: ${result.id}`);
  console.log(`Name: ${result.name}`);

  // Verify prompt patching
  for (let i = 0; i < result.members.length; i++) {
    const prompt = result.members[i].assistantOverrides?.model?.messages?.[0]?.content || '';
    const hasFlow = prompt.includes('CHAIN TOOL CALLS — NEVER PAUSE BETWEEN THEM');
    const hasBookingFix = isBookingAgent(prompt)
      ? prompt.includes('CRITICAL — TOOL CHAINING') || prompt.includes('Do NOT announce "profile created"')
      : true;
    console.log(`  Member ${i}: universalFlow=${hasFlow}, bookingFix=${hasBookingFix}`);
  }

  fs.writeFileSync(STATE_FILE, result.id);
  return result.id;
}

async function updateTestSquad(): Promise<void> {
  if (!fs.existsSync(STATE_FILE)) {
    console.error('No test squad found. Run "create" first.');
    process.exit(1);
  }
  const testSquadId = fs.readFileSync(STATE_FILE, 'utf8').trim();
  console.log('Fetching test squad:', testSquadId);
  const squad = await vapiRequest('GET', `/squad/${testSquadId}`);

  const patchedMembers = patchMemberPrompts(squad.members, MODEL_OVERRIDE);

  const payload = {
    members: patchedMembers.map((m: any) => {
      const { id, createdAt, updatedAt, orgId, ...rest } = m;
      return rest;
    }),
  };

  console.log('Updating test squad prompts...');
  if (MODEL_OVERRIDE) console.log(`Model override: ${MODEL_OVERRIDE}`);
  await vapiRequest('PATCH', `/squad/${testSquadId}`, payload);
  console.log('Done. Test squad updated:', testSquadId);
}

async function deleteTestSquad(): Promise<void> {
  if (!fs.existsSync(STATE_FILE)) {
    console.log('No test squad to delete.');
    return;
  }
  const testSquadId = fs.readFileSync(STATE_FILE, 'utf8').trim();
  console.log('Deleting test squad:', testSquadId);
  try {
    await vapiRequest('DELETE', `/squad/${testSquadId}`);
    console.log('Deleted.');
  } catch (e: any) {
    console.log('Delete failed (may already be deleted):', e.message?.substring(0, 100));
  }
  fs.unlinkSync(STATE_FILE);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const cmd = process.argv[2] || 'create';

  if (!VAPI_API_KEY || !SOURCE_SQUAD_ID) {
    console.error('Set VAPI_API_KEY and VAPI_SQUAD_ID env vars');
    process.exit(1);
  }

  switch (cmd) {
    case 'create':
      await createTestSquad();
      break;
    case 'update':
      await updateTestSquad();
      break;
    case 'delete':
      await deleteTestSquad();
      break;
    default:
      console.error(`Unknown command: ${cmd}. Use create|update|delete`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
