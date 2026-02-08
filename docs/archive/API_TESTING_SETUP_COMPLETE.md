# API Testing Setup - Complete ✅

## What Was Created

I've set up a comprehensive API testing system to verify frontend-backend-database communication.

---

## 🎯 Quick Start

### 1. Access the Test Page

After deploying, go to:
```
https://your-domain.com/home/test-api
```

(Must be logged in to access)

### 2. View Test Results

The page automatically runs 5 tests:
- ✅ Backend status check
- ✅ Echo test (JSON payload)
- ✅ Database test (authenticated)
- ✅ Frontend API routes
- ✅ Browser-to-backend communication

### 3. Check for Green Badges

All tests should show **PASS** (green) if everything is working.

---

## 📁 Files Created

### Backend (NestJS)

**Modified:**
- `apps/backend/src/app.controller.ts`
  - Added `POST /test/echo` - Unauthenticated echo test
  - Added `POST /test/db` - Authenticated database test

### Frontend (Next.js)

**New Page:**
- `apps/frontend/apps/web/app/home/(user)/test-api/page.tsx`
- `apps/frontend/apps/web/app/home/(user)/test-api/_components/test-api-server.tsx`
- `apps/frontend/apps/web/app/home/(user)/test-api/_components/test-api-client.tsx`

**New API Routes:**
- `apps/frontend/apps/web/app/api/test/backend-status/route.ts`
- `apps/frontend/apps/web/app/api/test/echo/route.ts`

---

## 🔧 Environment Setup

### Required Environment Variable

Add to your frontend environment (ECS task definition, `.env`, or SSM):

```bash
# Backend API URL - Internal ALB or service URL
BACKEND_API_URL=http://backend-service:4000

# Or if using public URL
BACKEND_API_URL=https://api.your-domain.com
```

### How to Set in Production

#### Option 1: ECS Task Definition
```json
{
  "name": "BACKEND_API_URL",
  "value": "http://dentia-backend-service:4000"
}
```

#### Option 2: SSM Parameter Store
```bash
aws ssm put-parameter \
  --name "/dentia/prod/BACKEND_API_URL" \
  --value "http://dentia-backend-service:4000" \
  --type "String" \
  --profile dentia
```

Then reference in ECS:
```json
{
  "name": "BACKEND_API_URL",
  "valueFrom": "arn:aws:ssm:region:account-id:parameter/dentia/prod/BACKEND_API_URL"
}
```

---

## 🧪 What Each Test Does

### Server-Side Tests (Run on Next.js Server)

1. **Backend Status Check**
   - Tests: Network connectivity
   - Endpoint: `GET /` (backend)
   - Auth: No
   - Success: Backend returns status + database state

2. **Echo Test**
   - Tests: POST requests with JSON payloads
   - Endpoint: `POST /test/echo` (backend)
   - Auth: No
   - Success: Backend echoes message back

3. **Database Test (Authenticated)**
   - Tests: Full stack (Auth + Backend + DB)
   - Endpoint: `POST /test/db` (backend)
   - Auth: Yes (Cognito JWT)
   - Success: Returns user data + database stats

### Client-Side Tests (Run in Browser)

4. **Frontend → Backend (via API Route)**
   - Tests: Browser → Next.js → NestJS
   - Endpoint: `GET /api/test/backend-status` (frontend API)
   - Success: Frontend API route can call backend

5. **Frontend API Route**
   - Tests: Next.js API routes
   - Endpoint: `POST /api/test/echo` (frontend API)
   - Success: API route responds correctly

---

## 🚀 Deployment Steps

### Step 1: Build & Push Docker Images

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Build frontend
docker build -f infra/docker/frontend.Dockerfile -t dentia-frontend:latest .

# Build backend
docker build -f infra/docker/backend.Dockerfile -t dentia-backend:latest .

# Push to ECR (replace with your URIs)
docker tag dentia-frontend:latest <frontend-ecr-uri>:latest
docker push <frontend-ecr-uri>:latest

docker tag dentia-backend:latest <backend-ecr-uri>:latest
docker push <backend-ecr-uri>:latest
```

### Step 2: Update ECS Services

```bash
# Update frontend service
aws ecs update-service \
  --cluster dentia-cluster \
  --service dentia-frontend-service \
  --force-new-deployment \
  --profile dentia \
  --region us-east-2

# Update backend service
aws ecs update-service \
  --cluster dentia-cluster \
  --service dentia-backend-service \
  --force-new-deployment \
  --profile dentia \
  --region us-east-2
```

### Step 3: Wait for Deployment

```bash
# Check frontend service
aws ecs describe-services \
  --cluster dentia-cluster \
  --services dentia-frontend-service \
  --profile dentia \
  --region us-east-2 \
  --query "services[0].deployments"

# Check backend service  
aws ecs describe-services \
  --cluster dentia-cluster \
  --services dentia-backend-service \
  --profile dentia \
  --region us-east-2 \
  --query "services[0].deployments"
```

### Step 4: Test in Production

1. Log in to your production site
2. Navigate to: `https://your-domain.com/home/test-api`
3. Verify all tests show **PASS** (green badges)

---

## 🔍 Debugging

### If Tests Fail

#### Backend Status Check Fails

**Error:** "Failed to reach backend"

**Check:**
```bash
# 1. Verify BACKEND_API_URL is set
aws ecs describe-task-definition \
  --task-definition dentia-frontend \
  --profile dentia \
  --query "taskDefinition.containerDefinitions[0].environment"

# 2. Check if backend is running
aws ecs list-tasks \
  --cluster dentia-cluster \
  --service-name dentia-backend-service \
  --profile dentia

# 3. Check backend logs
aws logs tail /ecs/dentia-backend --follow --profile dentia
```

#### Database Test Fails

**Error:** "Database test failed"

**Check:**
```bash
# 1. Check backend can reach database
aws logs filter-pattern "database" \
  --log-group-name /ecs/dentia-backend \
  --profile dentia

# 2. Verify DATABASE_URL is correct
# 3. Check security groups allow backend → RDS
```

#### Authentication Fails

**Error:** "Unable to call backend API without a Cognito access token"

**Check:**
1. User is logged in
2. Cognito environment variables are correct
3. Session is active

---

## 📊 Expected Results

### All Tests Passing

```
✅ Backend Status Check - PASS
   Backend is reachable
   {
     "message": "Dentia backend ready",
     "database": "reachable",
     "timestamp": "2025-01-04T..."
   }

✅ Echo Test - PASS
   Echo successful
   {
     "success": true,
     "echo": "Hello from Next.js!",
     "backend": "NestJS"
   }

✅ Database Test (Authenticated) - PASS
   Database connection successful
   {
     "success": true,
     "database": "connected",
     "user": { ... },
     "stats": { "totalUsers": 10, ... }
   }

✅ Frontend → Backend (via API Route) - PASS
   Successfully called backend via API route

✅ Frontend API Route - PASS
   Frontend API route working
```

---

## 🗑️ Cleanup (After Verification)

Once you've confirmed everything works in production:

### Option 1: Comment Out (Keep for future debugging)

**Backend:** `apps/backend/src/app.controller.ts`
```typescript
// @Post('test/echo')
// echo(@Body() body: { message: string }) { ... }

// @Post('test/db')
// async testDatabase() { ... }
```

### Option 2: Feature Flag (Recommended)

**Frontend:** Only show in development
```typescript
// In test-api/page.tsx
if (process.env.NODE_ENV === 'production') {
  notFound();
}
```

### Option 3: Delete (If confident)

```bash
# Backend - remove test methods from app.controller.ts

# Frontend
rm -rf apps/frontend/apps/web/app/home/\(user\)/test-api
rm -rf apps/frontend/apps/web/app/api/test
```

---

## ❓ Backend Calling Frontend

### Can Backend Call Frontend?

**Yes, technically**, but **NOT RECOMMENDED** for most cases.

### Why Not Recommended?

1. **Circular Dependency** - Creates tight coupling
2. **Scaling Issues** - Frontend may have multiple instances
3. **Security** - Backend would need to know frontend URLs
4. **Latency** - Extra network hop

### When It's Appropriate

**Webhooks (Event Notifications)**
```typescript
// Backend notifies frontend of events
await fetch(`${FRONTEND_URL}/api/webhooks/payment`, {
  method: 'POST',
  body: JSON.stringify({ userId, paymentId }),
});
```

### Recommended Pattern

Use **event-driven architecture** instead:

```
Backend → SQS/SNS → Frontend polls/subscribes
```

Or use **Server-Sent Events (SSE)** / **WebSockets** for real-time updates.

---

## 🎯 Success Criteria

Your setup is working correctly when:

- ✅ All 5 tests show **PASS** (green badges)
- ✅ No errors in CloudWatch logs
- ✅ Response times < 500ms
- ✅ Database queries execute successfully
- ✅ Authentication works
- ✅ User data is retrieved from database

---

## 📚 Documentation

See complete documentation in:
- **API_TESTING_GUIDE.md** - Comprehensive testing guide
- **E2E_TESTING_GUIDE.md** - End-to-end testing scenarios
- **IMPLEMENTATION_SUMMARY.md** - Full system overview

---

## 🎉 Ready to Test!

1. Deploy both frontend and backend
2. Set `BACKEND_API_URL` environment variable
3. Navigate to `/home/test-api`
4. Verify all tests pass
5. Comment out test endpoints after verification

**Your frontend-backend-database communication is now fully testable!** 🚀

