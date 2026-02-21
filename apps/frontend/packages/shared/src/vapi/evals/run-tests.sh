#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  Dental Clinic Eval Test Suite — Command Reference
#
#  All commands run from this directory:
#    cd apps/frontend/packages/shared/src/vapi/evals
#
#  Before running: edit eval-config.ts to set model, temperature,
#  and prompt overrides.
# ═══════════════════════════════════════════════════════════════════

# ───────────────────────────────────────────────────────────────────
# TRIAGE TESTS — routing & handoff (~85+ tests)
# ───────────────────────────────────────────────────────────────────

npx tsx run-isolated.ts triage                  # all triage tests
npx tsx run-isolated.ts triage emergency        # emergency routing (pain, bleeding, trauma)
npx tsx run-isolated.ts triage scheduling       # scheduling routing (appointments, booking)
npx tsx run-isolated.ts triage insurance        # insurance routing
npx tsx run-isolated.ts triage payment          # payment/billing routing
npx tsx run-isolated.ts triage records          # patient records routing
npx tsx run-isolated.ts triage clinicInfo       # clinic info routing (hours, location)
npx tsx run-isolated.ts triage priority         # edge cases (priority conflicts, ambiguous, angry caller)
npx tsx run-isolated.ts triage silentHandoff    # STRICT: handoff with ZERO spoken words

# ───────────────────────────────────────────────────────────────────
# SCHEDULING TESTS — workflow & tool calls (~30+ tests)
# ───────────────────────────────────────────────────────────────────

npx tsx run-isolated.ts scheduling              # all scheduling tests
npx tsx run-isolated.ts scheduling takeover     # seamless takeover (no greeting after handoff)
npx tsx run-isolated.ts scheduling toolOrder    # correct tool call order
npx tsx run-isolated.ts scheduling continuation # no dead air after tool responses
npx tsx run-isolated.ts scheduling requiredFields  # email/name/phone collected before tools
npx tsx run-isolated.ts scheduling confirmation # readback before booking
npx tsx run-isolated.ts scheduling errorHandling   # tool failures & fully booked dates
npx tsx run-isolated.ts scheduling crossRouting    # mid-scheduling route to insurance/emergency
npx tsx run-isolated.ts scheduling paramValidation # exact param names/types/formats

# ───────────────────────────────────────────────────────────────────
# TOOL CALL TESTS — PMS tools param validation + response eval (~50 tests)
# ───────────────────────────────────────────────────────────────────

npx tsx run-isolated.ts tool-calls              # all tool call tests
npx tsx run-isolated.ts tool-calls scheduling   # scheduling tool params (lookupPatient, bookAppointment, etc.)
npx tsx run-isolated.ts tool-calls insurance    # insurance tool params (saveInsurance, verifyCoverage, etc.)
npx tsx run-isolated.ts tool-calls payment      # payment tool params (processPayment, createPaymentPlan, etc.)
npx tsx run-isolated.ts tool-calls records      # patient records tool params (updatePatient, etc.)
npx tsx run-isolated.ts tool-calls response     # response evaluation (did assistant interpret API data correctly?)

# ───────────────────────────────────────────────────────────────────
# HIPAA GUARDRAILS — v4.1 HIPAA compliance, PHI redaction, renamed tools (~17 tests)
# ───────────────────────────────────────────────────────────────────

npx tsx run-isolated.ts hipaa                       # all HIPAA tests
npx tsx run-isolated.ts hipaa verification          # caller identity verification (callerVerified flow)
npx tsx run-isolated.ts hipaa phi-redaction          # PHI field filtering / redaction tests
npx tsx run-isolated.ts hipaa family                 # family account (multiple patients on one phone)
npx tsx run-isolated.ts hipaa anti-hallucination     # refuses medical advice / no hallucination
npx tsx run-isolated.ts hipaa renamed-tools          # v4.1 renamed tools (lookupPatient, addNote, etc.)
npx tsx run-isolated.ts hipaa third-party            # third-party access prevention

# ───────────────────────────────────────────────────────────────────
# FULL SUITE — run the comprehensive suite (all categories)
# ───────────────────────────────────────────────────────────────────

npx tsx run-evals.ts                            # all tests in dental-clinic-eval-suite.ts
npx tsx run-evals.ts --category triage-routing  # filter by category
npx tsx run-evals.ts --tag critical             # filter by tag

# ───────────────────────────────────────────────────────────────────
# UTILITIES
# ───────────────────────────────────────────────────────────────────

npx tsx run-isolated.ts list                    # show all suites, groups, and test counts
npx tsx run-isolated.ts cleanup                 # delete ALL evals from Vapi (fresh start)

# ───────────────────────────────────────────────────────────────────
# WORKFLOW: Fix one area at a time
# ───────────────────────────────────────────────────────────────────
#
# 1. Edit eval-config.ts → set ACTIVE_MODEL, TEMPERATURE_OVERRIDE, PROMPT_OVERRIDES
# 2. Run the failing suite:
#      npx tsx run-isolated.ts triage silentHandoff
# 3. Look at failures
# 4. Edit the prompt override in eval-config.ts
# 5. Re-run the same suite
# 6. Repeat until 100%
# 7. Move to next suite
#
# ───────────────────────────────────────────────────────────────────
# WORKFLOW: Compare models
# ───────────────────────────────────────────────────────────────────
#
# 1. Set ACTIVE_MODEL to gpt-5-mini in eval-config.ts
# 2. Run:  npx tsx run-isolated.ts triage
# 3. Results saved to: eval-results-triage-gpt-5-mini.json
#
# 4. Set ACTIVE_MODEL to claude-sonnet-4-20250514 in eval-config.ts
# 5. Run:  npx tsx run-isolated.ts triage
# 6. Results saved to: eval-results-triage-claude-sonnet.json
#
# 7. Compare the JSON files
