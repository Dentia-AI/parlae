# Backend Refactor Progress

## Goal
Move all business logic, webhooks, and API integrations from Frontend (Next.js) to Backend (NestJS).

## What Stays in Frontend
- ✅ PMS setup UI (`/app/home/agent/setup/pms/page.tsx`)
- ✅ Agent setup wizard UI (`/app/home/agent/setup/*`)
- ✅ Admin UI components
- ✅ Analytics dashboard UI
- ✅ Twilio phone number selection UI
- ✅ Simple pass-through API routes for UI data

## What Moves to Backend
- ❌ PMS API integration (Sikka service, token refresh, writebacks)
- ❌ Vapi tool webhooks (book-appointment, check-availability, transfer-to-human)
- ❌ Twilio voice webhook handler
- ❌ All business logic related to calls and appointments

## Migration Checklist

### Phase 1: Backend Setup ✅
- [x] Create directory structure
- [x] Verify NestJS CLI available

### Phase 2: PMS Module
- [ ] Copy PMS types and interfaces
- [ ] Create PMS module, controller, service
- [ ] Copy Sikka service implementation
- [ ] Copy token refresh service
- [ ] Copy writeback service
- [ ] Add Cognito auth guard to controller
- [ ] Test PMS setup endpoint

### Phase 3: Vapi Module
- [ ] Create Vapi module, controller, service
- [ ] Copy Vapi service (API client)
- [ ] Create tool endpoints:
  - [ ] /vapi/tools/book-appointment
  - [ ] /vapi/tools/check-availability
  - [ ] /vapi/tools/transfer-to-human
  - [ ] /vapi/tools/get-patient-info
- [ ] Add webhook signature verification
- [ ] Test tool endpoints

### Phase 4: Twilio Module
- [ ] Create Twilio module, controller, service
- [ ] Copy Twilio service (API client)
- [ ] Create voice webhook endpoint
- [ ] Test inbound call handling

### Phase 5: Frontend Cleanup
- [ ] Remove `/app/api/pms/setup/route.ts`
- [ ] Remove `/app/api/pms/appointments/route.ts`
- [ ] Remove `/app/api/pms/patients/route.ts`
- [ ] Remove `/app/api/vapi/tools/*`
- [ ] Remove `/app/api/twilio/voice/route.ts`
- [ ] Remove `/packages/shared/src/pms/*`
- [ ] Remove `/packages/shared/src/vapi/vapi.service.ts`
- [ ] Remove `/packages/shared/src/twilio/twilio.service.ts`
- [ ] Update frontend to call backend APIs

### Phase 6: Configuration
- [ ] Update Vapi webhook URLs in dashboard
- [ ] Update Twilio webhook URLs in dashboard
- [ ] Add environment variables to backend
- [ ] Test end-to-end flow

## Current Status
**Phase 1 Complete** - Directory structure created

## Next Steps
Starting Phase 2: PMS Module migration
