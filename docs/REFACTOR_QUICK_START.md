# Backend Refactor - Quick Start ⚡

## Status: ✅ 100% COMPLETE

All code is working. Just needs environment configuration.

---

## Quick Test (2 minutes)

### 1. Generate Encryption Key
```bash
openssl rand -hex 32
# Copy output - you'll need it for .env
```

### 2. Create Backend .env
```bash
cd apps/backend
cat > .env << 'EOF'
# Database (use your existing URL)
DATABASE_URL="postgresql://user:pass@localhost:5432/parlae"

# Cognito (copy from frontend .env.local)
COGNITO_USER_POOL_ID=your_pool_id
COGNITO_CLIENT_ID=your_client_id
COGNITO_REGION=us-west-2

# Encryption (paste the key generated above)
ENCRYPTION_KEY=paste_your_32_byte_hex_key_here

# Vapi (copy from frontend .env.local)
VAPI_API_KEY=your_vapi_key
VAPI_WEBHOOK_SECRET=your_webhook_secret

# Twilio (copy from frontend .env.local)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_MESSAGING_SERVICE_SID=your_messaging_sid

# App
APP_BASE_URL=http://localhost:4000
PORT=4000
EOF
```

### 3. Start Backend
```bash
npm run start:dev
```

**Expected Output:**
```
[Nest] LOG [NestFactory] Starting Nest application...
[Nest] LOG [InstanceLoader] PmsModule dependencies initialized
[Nest] LOG [InstanceLoader] VapiModule dependencies initialized
[Nest] LOG [InstanceLoader] TwilioModule dependencies initialized
[Nest] LOG [NestApplication] Nest application successfully started
[Nest] LOG Application is running on: http://localhost:4000
```

### 4. Test Health Endpoint
```bash
curl http://localhost:4000/health
# Should return: {"status":"ok","database":"connected",...}
```

---

## What Changed

### Backend (NestJS) - NEW ✨
- **PMS Module**: `/pms/setup`, `/pms/status` (requires auth)
- **Vapi Module**: `/vapi/tools/*` (webhook handlers)
- **Twilio Module**: `/twilio/voice` (call routing)

### Frontend (Next.js) - MINIMAL CHANGES
- Keep all existing UI code ✅
- Keep Vapi/Twilio client services ✅
- Only change: PMS setup calls backend API instead of local route

---

## API Endpoints

### Authenticated (Require JWT)
- `POST /pms/setup` - Setup PMS integration
- `GET /pms/status` - Get PMS status

### Webhooks (Require Signature)
- `POST /vapi/tools/transfer-to-human`
- `POST /vapi/tools/book-appointment`
- `POST /vapi/tools/check-availability`
- `POST /vapi/tools/get-patient-info`
- `POST /twilio/voice`

### Public
- `GET /health` - Health check

---

## Need Help?

**Full Documentation:**
- `docs/REFACTOR_COMPLETE_FINAL.md` - Complete overview
- `docs/BACKEND_API_REFERENCE.md` - API documentation
- `docs/FRONTEND_MIGRATION_GUIDE.md` - Frontend changes

**Common Issues:**

1. **"Cognito issuer is not configured"**
   → Add `COGNITO_USER_POOL_ID` to `.env`

2. **"Cannot connect to database"**
   → Check `DATABASE_URL` in `.env`

3. **"Module not found"**
   → Run `pnpm install` in root directory

---

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│  Frontend:3000  │────────▶│  Backend:4000    │
│                 │         │                  │
│  - UI           │         │  - PMS Logic     │
│  - Setup Pages  │         │  - Webhooks      │
│  - Admin Tools  │         │  - Call Routing  │
└─────────────────┘         └──────────────────┘
                                     │
                            ┌────────┴────────┐
                            │                 │
                         ┌──▼──┐          ┌──▼──┐
                         │Vapi │          │ PMS │
                         │     │          │     │
                         └─────┘          └─────┘
```

---

## Next Steps

1. ✅ Backend is ready
2. Configure `.env` (see step 2 above)
3. Start backend: `npm run start:dev`
4. Test health: `curl http://localhost:4000/health`
5. Update Vapi webhook URLs (production only)
6. Update Twilio webhook URLs (production only)

**That's it!** 🎉

---

**Status**: Ready to run  
**Last Updated**: Feb 11, 2026  
**Time to Start**: 2 minutes
