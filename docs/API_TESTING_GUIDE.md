# API Communication Testing Guide

## Architecture Overview

Your application uses a **microservices architecture**:

```
┌─────────────┐      HTTP/REST      ┌─────────────┐      SQL      ┌──────────────┐
│  Frontend   │ ──────────────────> │   Backend   │ ──────────────> │   Database   │
│  (Next.js)  │ <────────────────── │  (NestJS)   │ <────────────── │ (PostgreSQL) │
└─────────────┘   JSON Responses    └─────────────┘   Query Results └──────────────┘
     Port 3000                            Port 4000                   Port 5432/15432
```

### Communication Flow

1. **Browser → Frontend (Next.js)**
   - User interacts with UI
   - Client-side React components

2. **Frontend → Backend (NestJS)**
   - Next.js Server Components call backend
   - Next.js API Routes proxy to backend
   - Uses Cognito JWT for authentication

3. **Backend → Database (PostgreSQL)**
   - NestJS uses Prisma ORM
   - Direct SQL queries via Prisma

---

## ✅ Test Endpoints Created

### Backend (NestJS) - Port 4000

| Method | Endpoint | Auth Required | Purpose |
|--------|----------|---------------|---------|
| GET | `/` | No | Health check + DB status |
| GET | `/me` | Yes | Get authenticated user info |
| POST | `/test/echo` | No | Echo test for connectivity |
| POST | `/test/db` | Yes | Full stack test (Auth + DB) |
| GET | `/health` | No | Health check |

### Frontend (Next.js) - Port 3000

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/test/backend-status` | Proxy to backend status |
| POST | `/api/test/echo` | Echo test for API routes |
| GET | `/home/test-api` | **Test UI Page** |

---

## 🧪 Testing in Production

### Step 1: Access the Test Page

```
https://your-domain.com/home/test-api
```

This page automatically runs:
- ✅ Backend status check (unauthenticated)
- ✅ Echo test (POST request)
- ✅ Database test (authenticated)
- ✅ Client-side tests (browser → API routes)

### Step 2: Review Test Results

The page shows:
- **Server-Side Tests**: Run on Next.js server
  - Backend connectivity
  - JSON payload handling
  - Authentication flow
  - Database queries

- **Client-Side Tests**: Run in browser
  - API route functionality
  - Frontend-to-backend proxy
  - Browser-side fetch calls

### Step 3: Check Each Test

Each test shows:
- ✅ **PASS** - Green badge, successful
- ❌ **FAIL** - Red badge, with error details
- Response data in JSON format

---

## 🔧 Environment Configuration

### Required Environment Variables

#### Frontend (`apps/frontend/apps/web/.env`)

```bash
# Backend API URL
BACKEND_API_URL=http://localhost:4000

# Or for client-side access (if needed)
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:4000

# Cognito (for authentication)
COGNITO_CLIENT_ID=your-client-id
COGNITO_CLIENT_SECRET=your-client-secret
COGNITO_ISSUER=https://cognito-idp.region.amazonaws.com/user-pool-id
```

#### Production URLs

```bash
# Development
BACKEND_API_URL=http://localhost:4000

# Production
BACKEND_API_URL=https://api.your-domain.com

# Or if using ALB internal routing
BACKEND_API_URL=http://backend-service:4000
```

---

## 📊 Test Scenarios

### Scenario 1: Basic Connectivity

**Test:** Frontend calls backend status endpoint

**Expected Result:**
```json
{
  "success": true,
  "message": "Dentia backend ready",
  "database": "reachable",
  "timestamp": "2025-01-04T12:00:00.000Z"
}
```

**What it tests:**
- Network connectivity
- Backend is running
- Database is accessible

### Scenario 2: JSON Payload Handling

**Test:** Frontend sends JSON to backend

**Request:**
```json
{
  "message": "Hello from Next.js!",
  "timestamp": "2025-01-04T12:00:00.000Z"
}
```

**Expected Response:**
```json
{
  "success": true,
  "echo": "Hello from Next.js!",
  "receivedAt": "2025-01-04T12:00:00.100Z",
  "sentAt": "2025-01-04T12:00:00.000Z",
  "backend": "NestJS"
}
```

**What it tests:**
- Request/response cycle
- JSON serialization/deserialization
- POST request handling

### Scenario 3: Authentication Flow

**Test:** Authenticated request with Cognito JWT

**Expected Result:**
```json
{
  "success": true,
  "database": "connected",
  "authenticated": true,
  "user": {
    "cognitoId": "user-sub-id",
    "email": "user@example.com",
    "dbRecord": {
      "id": "user-id",
      "email": "user@example.com",
      "role": "ACCOUNT_MANAGER"
    }
  },
  "stats": {
    "totalUsers": 10,
    "totalAccounts": 15
  }
}
```

**What it tests:**
- Cognito JWT verification
- Backend auth guard
- Database queries with authenticated user
- User exists in database

---

## 🚨 Troubleshooting

### Error: "Unable to call backend API without a Cognito access token"

**Cause:** User is not authenticated

**Solution:**
1. Ensure user is logged in
2. Check `COGNITO_*` environment variables
3. Verify session is active

### Error: "Backend status request failed (500)"

**Cause:** Backend is not running or unreachable

**Solution:**
1. Check `BACKEND_API_URL` environment variable
2. Verify backend is running: `curl http://localhost:4000`
3. Check network connectivity
4. Review backend logs

### Error: "database: unreachable"

**Cause:** Backend can't connect to database

**Solution:**
1. Check `DATABASE_URL` in backend
2. Verify database is running
3. Check database credentials
4. Test connection: `psql -h host -p port -U user -d database`

### Error: "CORS error" (in browser console)

**Cause:** Backend doesn't allow frontend origin

**Solution:**
Add CORS configuration to backend (`apps/backend/src/main.ts`):
```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
});
```

---

## 🔄 Backend Calling Frontend

### Question: Can Backend Call Frontend?

**Short Answer:** Yes, but it's **not recommended** for most use cases.

**Why Not Recommended:**
1. **Circular Dependency**: Creates tight coupling
2. **Scaling Issues**: Frontend may have multiple instances
3. **Webhook Pattern**: Use webhooks for async notifications instead

### When Backend Might Call Frontend

**Scenario 1: Webhooks (Recommended)**
```
Backend receives event → Calls webhook endpoint on frontend
```

Example:
```typescript
// Backend sends webhook
await fetch(`${FRONTEND_URL}/api/webhooks/payment-complete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId, paymentId }),
});
```

**Scenario 2: Server-Sent Events (SSE)**
```
Frontend opens SSE connection → Backend streams events
```

**Scenario 3: WebSockets**
```
Bidirectional real-time communication
```

### Recommended Pattern: Event-Driven Architecture

Instead of backend calling frontend:

1. **Backend emits events** to message queue (SQS, SNS, EventBridge)
2. **Frontend polls** for updates or subscribes to events
3. **Use webhooks** for async notifications

```
┌──────────┐     Event      ┌───────────┐     Poll/Subscribe     ┌──────────┐
│ Backend  │ ─────────────> │  Queue    │ <──────────────────── │ Frontend │
└──────────┘                └───────────┘                        └──────────┘
                            (SQS/SNS/etc)
```

---

## 📝 Manual Testing with curl

### Test 1: Backend Status (Unauthenticated)

```bash
curl http://localhost:4000/
```

### Test 2: Backend Echo

```bash
curl -X POST http://localhost:4000/test/echo \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello","timestamp":"2025-01-04T12:00:00.000Z"}'
```

### Test 3: Backend DB Test (Authenticated)

```bash
# Get access token first (from browser dev tools or login)
TOKEN="your-cognito-jwt-token"

curl -X POST http://localhost:4000/test/db \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}'
```

### Test 4: Frontend API Route

```bash
curl http://localhost:3000/api/test/backend-status
```

---

## 🗑️ Cleanup After Testing

Once you've verified everything works in production, you can:

### Option 1: Comment Out (Recommended for now)

Keep the code but disable the routes:

**Backend:** Comment out test endpoints in `app.controller.ts`
```typescript
// @Post('test/echo')
// echo(@Body() body: { message: string }) { ... }

// @Post('test/db')
// async testDatabase() { ... }
```

**Frontend:** Remove the test page link from navigation (don't delete the page yet)

### Option 2: Delete Test Files (After confirmation)

```bash
# Backend
# Remove test endpoints from apps/backend/src/app.controller.ts

# Frontend
rm -rf apps/frontend/apps/web/app/home/\(user\)/test-api
rm -rf apps/frontend/apps/web/app/api/test
```

### Option 3: Feature Flag (Best for long-term)

Only show test page in non-production:

```typescript
// In test-api/page.tsx
import { notFound } from 'next/navigation';

function TestApiPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound(); // Or redirect
  }
  
  // ... rest of component
}
```

---

## 🎯 Production Deployment Checklist

Before deploying to production:

- [ ] Set `BACKEND_API_URL` environment variable
- [ ] Verify Cognito configuration
- [ ] Test `/home/test-api` page
- [ ] Check all tests pass (green badges)
- [ ] Review CloudWatch logs for errors
- [ ] Test with real user authentication
- [ ] Verify database queries work
- [ ] Check API response times (< 500ms)
- [ ] Monitor backend health endpoint
- [ ] Comment out or remove test endpoints

---

## 📚 Related Documentation

- `apps/frontend/apps/web/lib/server/backend-api.ts` - Backend API helpers
- `apps/backend/src/app.controller.ts` - Backend endpoints
- `apps/backend/src/auth/cognito-auth.guard.ts` - Authentication
- `E2E_TESTING_GUIDE.md` - Complete end-to-end testing

---

## 🔗 Quick Links

**Test Page:** `https://your-domain.com/home/test-api`

**Backend Health:** `https://api.your-domain.com/health`

**Backend Status:** `https://api.your-domain.com/`

---

## Success Criteria

✅ All tests show **PASS** (green badges)
✅ No errors in CloudWatch logs
✅ Response times < 500ms
✅ Authenticated requests work
✅ Database queries execute successfully
✅ Frontend-backend communication confirmed

**Once verified, you can safely comment out the test endpoints!** 🎉

