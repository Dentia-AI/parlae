# Architecture Refactor Plan: Move PMS & Vapi Tools to Backend

## Current Issue

The PMS services (Sikka), Vapi tool implementations, and webhook handlers are currently in the **frontend** Next.js application. This is incorrect because:

1. **Vapi webhooks call the backend** - Tool calls from Vapi should go to the core NestJS backend
2. **Security** - PMS credentials and API keys should not be in frontend code
3. **Separation of concerns** - Frontend should only handle UI/setup, backend handles business logic
4. **Scalability** - Backend can be scaled independently

## Current Architecture (INCORRECT)

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (Next.js)                                          │
├─────────────────────────────────────────────────────────────┤
│ /apps/frontend/apps/web/app/api/                           │
│   ├── pms/setup/route.ts          ❌ Should be in backend  │
│   ├── vapi/templates/route.ts     ✅ OK (frontend UI)      │
│   ├── vapi/phone-numbers/route.ts ✅ OK (frontend UI)      │
│   ├── vapi/tools/                 ❌ Should be in backend  │
│   │   └── transfer-to-human/      (Vapi tool webhook)      │
│   └── twilio/voice/route.ts       ❌ Should be in backend  │
│                                                             │
│ /apps/frontend/packages/shared/src/                        │
│   ├── pms/                         ❌ Should be in backend  │
│   │   ├── sikka.service.ts        (PMS API calls)          │
│   │   ├── sikka-token-refresh.ts  (Token management)       │
│   │   └── sikka-writeback.ts      (Appointment writebacks) │
│   ├── vapi/                        ❌ Should be in backend  │
│   │   └── vapi.service.ts         (Vapi API client)        │
│   └── twilio/                      ❌ Should be in backend  │
│       └── twilio.service.ts       (Twilio API client)      │
│                                                             │
│ ✅ KEEP IN FRONTEND:                                        │
│   - PMS Setup UI components                                │
│   - Agent Setup Wizard                                     │
│   - Dashboard/Analytics views                              │
└─────────────────────────────────────────────────────────────┘
```

## Target Architecture (CORRECT)

```
┌─────────────────────────────────────────────────────────────┐
│ VAPI                                                        │
├─────────────────────────────────────────────────────────────┤
│ • Phone calls trigger tool calls                           │
│ • Webhooks point to: https://api.parlae.ai/vapi/tools/*   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ BACKEND (NestJS) - Port 4000                               │
├─────────────────────────────────────────────────────────────┤
│ /apps/backend/src/                                         │
│                                                            │
│ ├── pms/                          ✅ MOVE HERE             │
│ │   ├── pms.module.ts                                     │
│ │   ├── pms.controller.ts        (Setup endpoint)         │
│ │   ├── pms.service.ts           (PMS abstraction)        │
│ │   ├── providers/                                        │
│ │   │   ├── sikka.service.ts     (Sikka implementation)   │
│ │   │   ├── sikka-token.service.ts                        │
│ │   │   └── sikka-writeback.service.ts                    │
│ │   └── interfaces/                                       │
│ │       └── pms-provider.interface.ts                     │
│ │                                                          │
│ ├── vapi/                         ✅ MOVE HERE             │
│ │   ├── vapi.module.ts                                    │
│ │   ├── vapi-tools.controller.ts  (Webhook endpoints)     │
│ │   ├── vapi.service.ts           (Vapi API client)       │
│ │   └── tools/                                            │
│ │       ├── book-appointment.tool.ts                      │
│ │       ├── check-availability.tool.ts                    │
│ │       ├── transfer-to-human.tool.ts                     │
│ │       └── get-patient-info.tool.ts                      │
│ │                                                          │
│ ├── twilio/                       ✅ MOVE HERE             │
│ │   ├── twilio.module.ts                                  │
│ │   ├── twilio-voice.controller.ts  (Voice webhook)       │
│ │   └── twilio.service.ts         (Twilio API client)     │
│ │                                                          │
│ └── phone-integration/             ✅ NEW MODULE           │
│     ├── phone-integration.module.ts                        │
│     ├── phone-integration.controller.ts                    │
│     └── phone-integration.service.ts                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (Next.js) - Port 3000                             │
├─────────────────────────────────────────────────────────────┤
│ /apps/frontend/apps/web/                                   │
│                                                            │
│ ✅ KEEP: UI Components                                     │
│   ├── app/home/agent/setup/                               │
│   │   ├── page.tsx                (Voice selection)       │
│   │   ├── knowledge/page.tsx      (Knowledge base)        │
│   │   ├── integrations/page.tsx   (Integrations UI)       │
│   │   ├── pms/page.tsx            (PMS setup UI)          │
│   │   └── phone/page.tsx          (Phone integration UI)  │
│   │                                                        │
│   └── app/home/analytics/         (Analytics dashboard)   │
│                                                            │
│ ✅ KEEP: Client-side API calls to backend                 │
│   - Call backend API: https://api.parlae.ai/pms/setup    │
│   - Call backend API: https://api.parlae.ai/vapi/tools/* │
│                                                            │
│ ❌ REMOVE: API routes (move to backend)                   │
│   - /app/api/pms/                 → Backend endpoint      │
│   - /app/api/vapi/tools/          → Backend endpoint      │
│   - /app/api/twilio/              → Backend endpoint      │
└─────────────────────────────────────────────────────────────┘
```

## Migration Steps

### Phase 1: Create Backend Modules

1. **Create PMS Module**
   ```bash
   cd apps/backend
   nest g module pms
   nest g controller pms
   nest g service pms
   ```

2. **Create Vapi Module**
   ```bash
   nest g module vapi
   nest g controller vapi/vapi-tools
   nest g service vapi
   ```

3. **Create Twilio Module**
   ```bash
   nest g module twilio
   nest g controller twilio/twilio-voice
   nest g service twilio
   ```

### Phase 2: Move Services

1. **Move PMS Services**
   - Copy `/apps/frontend/packages/shared/src/pms/*` → `/apps/backend/src/pms/providers/`
   - Convert to NestJS services
   - Add proper dependency injection

2. **Move Vapi Service**
   - Copy `/apps/frontend/packages/shared/src/vapi/vapi.service.ts` → `/apps/backend/src/vapi/`
   - Convert to NestJS service

3. **Move Twilio Service**
   - Copy `/apps/frontend/packages/shared/src/twilio/twilio.service.ts` → `/apps/backend/src/twilio/`
   - Convert to NestJS service

### Phase 3: Create Controllers

1. **PMS Controller** (`/apps/backend/src/pms/pms.controller.ts`)
   ```typescript
   @Controller('pms')
   @UseGuards(CognitoAuthGuard)
   export class PmsController {
     @Post('setup')
     async setupPms(@Body() dto: SetupPmsDto, @CurrentUser() user) {
       // Moved from /apps/frontend/apps/web/app/api/pms/setup/route.ts
     }
     
     @Get('status')
     async getPmsStatus(@CurrentUser() user) {
       // Moved from /apps/frontend/apps/web/app/api/pms/setup/route.ts
     }
   }
   ```

2. **Vapi Tools Controller** (`/apps/backend/src/vapi/vapi-tools.controller.ts`)
   ```typescript
   @Controller('vapi/tools')
   export class VapiToolsController {
     @Post('book-appointment')
     async bookAppointment(@Body() dto: VapiToolCallDto) {
       // Tool implementation
     }
     
     @Post('check-availability')
     async checkAvailability(@Body() dto: VapiToolCallDto) {
       // Tool implementation
     }
     
     @Post('transfer-to-human')
     async transferToHuman(@Body() dto: VapiToolCallDto) {
       // Moved from /apps/frontend/apps/web/app/api/vapi/tools/transfer-to-human/route.ts
     }
   }
   ```

3. **Twilio Voice Controller** (`/apps/backend/src/twilio/twilio-voice.controller.ts`)
   ```typescript
   @Controller('twilio')
   export class TwilioVoiceController {
     @Post('voice')
     async handleInboundCall(@Body() dto: TwilioVoiceDto) {
       // Moved from /apps/frontend/apps/web/app/api/twilio/voice/route.ts
     }
   }
   ```

### Phase 4: Update Frontend

1. **Update API Calls**
   - Change frontend to call backend API endpoints
   - Use environment variable for backend URL
   - Add proper error handling

2. **Remove Frontend API Routes**
   - Delete `/apps/frontend/apps/web/app/api/pms/`
   - Delete `/apps/frontend/apps/web/app/api/vapi/tools/`
   - Delete `/apps/frontend/apps/web/app/api/twilio/`

3. **Keep Frontend Templates Routes** (These are UI-related)
   - ✅ KEEP: `/apps/frontend/apps/web/app/api/vapi/templates/route.ts`
   - ✅ KEEP: `/apps/frontend/apps/web/app/api/vapi/phone-numbers/route.ts`

### Phase 5: Update Vapi Webhook URLs

1. **Update Vapi Dashboard**
   - Change tool URLs from `https://app.parlae.ai/api/vapi/tools/*`
   - To: `https://api.parlae.ai/vapi/tools/*`

2. **Update Environment Variables**
   ```bash
   # Backend .env
   VAPI_API_KEY=your_vapi_key
   VAPI_WEBHOOK_SECRET=your_webhook_secret
   SIKKA_API_KEY=your_sikka_key
   SIKKA_API_SECRET=your_sikka_secret
   TWILIO_ACCOUNT_SID=your_twilio_sid
   TWILIO_AUTH_TOKEN=your_twilio_token
   ```

## Benefits After Refactor

✅ **Proper separation of concerns**
- Frontend: UI/UX only
- Backend: Business logic, integrations, webhooks

✅ **Better security**
- API keys never exposed to frontend
- PMS credentials handled server-side only

✅ **Easier testing**
- Backend can be tested independently
- Mock services for unit tests

✅ **Better scalability**
- Backend can scale independently
- Can add load balancing to backend

✅ **Proper architecture**
- Follows NestJS best practices
- Clean module structure
- Dependency injection

## Frontend-Only API Routes (KEEP)

These routes are OK to stay in frontend because they handle UI-specific data:

```typescript
// ✅ KEEP - These are UI configuration routes
/apps/frontend/apps/web/app/api/
  ├── vapi/
  │   ├── templates/route.ts       // List available squad/assistant templates for UI
  │   └── phone-numbers/route.ts   // CRUD for user's phone numbers in UI
  └── analytics/                    // Analytics dashboard data for UI
```

## Timeline

- **Phase 1**: 1 day (Create modules)
- **Phase 2**: 2 days (Move services)
- **Phase 3**: 2 days (Create controllers)
- **Phase 4**: 1 day (Update frontend)
- **Phase 5**: 1 day (Update Vapi configuration)

**Total**: ~1 week

## Testing Strategy

1. **Unit Tests**: Test each service independently
2. **Integration Tests**: Test controller → service → database
3. **E2E Tests**: Test full flow from Vapi webhook → PMS API
4. **Manual Testing**: Test phone calls end-to-end

## Rollback Plan

Keep old frontend API routes for 1 week after deployment:
- Route requests to both old and new endpoints
- Monitor logs for errors
- Gradually shift traffic to backend
- Remove frontend routes after verification
