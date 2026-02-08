# Docker Compose Cognito Configuration Fix

## Problem
Backend service fails to start with error:
```
Error: Cognito issuer is not configured
```

## Solution

The `docker-compose.yml` was missing Cognito environment variables. I've updated it to use environment variables with fallback defaults.

---

## Quick Fix - Option 1: Use Environment Variables (Recommended)

### 1. Create a `.env` file in the project root:

```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Copy the template
cp .env.docker .env

# Edit with your actual values
vim .env
```

### 2. Fill in your Cognito details:

```bash
# Get these from AWS Console → Cognito → User Pools
COGNITO_USER_POOL_ID=us-east-2_YourActualPoolId
COGNITO_CLIENT_ID=your-actual-client-id
COGNITO_CLIENT_SECRET=your-actual-client-secret
COGNITO_ISSUER=https://cognito-idp.us-east-2.amazonaws.com/us-east-2_YourActualPoolId

# Generate a secure secret
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# Enable credentials login for easier local testing
ENABLE_CREDENTIALS_SIGNIN=true
```

### 3. Restart Docker Compose:

```bash
docker-compose down
docker-compose up
```

Docker Compose automatically reads the `.env` file!

---

## Quick Fix - Option 2: Use Placeholder Values (For Testing Without Cognito)

The updated `docker-compose.yml` now has placeholder values that allow the services to start even without real Cognito credentials.

**Just restart:**
```bash
docker-compose down
docker-compose up
```

**Note**: With placeholder values:
- ✅ Services will start successfully
- ✅ You can test UI and database
- ❌ Authentication won't work (can't actually login)
- ❌ Backend API calls requiring auth will fail

---

## Getting Your Cognito Values

### From AWS Console:

1. **Go to Cognito**: https://console.aws.amazon.com/cognito/
2. **Select your User Pool**
3. **Get the values**:

```bash
# User Pool ID (from Overview tab)
COGNITO_USER_POOL_ID=us-east-2_xxxxxxxxx

# From "App integration" tab → App clients
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Issuer URL (format)
COGNITO_ISSUER=https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}
# Example: https://cognito-idp.us-east-2.amazonaws.com/us-east-2_abc123
```

### From Your Infrastructure Code:

If you deployed with Terraform:

```bash
cd /Users/shaunk/Projects/Dentia/dentia-infra/infra/ecs

# Get outputs
terraform output cognito_user_pool_id
terraform output cognito_client_id
terraform output cognito_client_secret  # This is sensitive
```

Or from SSM Parameter Store:

```bash
aws ssm get-parameter --name "/dentia/shared/COGNITO_USER_POOL_ID" --profile dentia
aws ssm get-parameter --name "/dentia/shared/COGNITO_CLIENT_ID" --profile dentia
aws ssm get-parameter --name "/dentia/frontend/COGNITO_CLIENT_SECRET" --with-decryption --profile dentia
```

---

## Updated docker-compose.yml Structure

The updated file now includes:

### Backend Service:
```yaml
backend:
  environment:
    # ... other vars ...
    COGNITO_USER_POOL_ID: ${COGNITO_USER_POOL_ID:-us-east-2_PLACEHOLDER}
    COGNITO_CLIENT_ID: ${COGNITO_CLIENT_ID:-placeholder-client-id}
    COGNITO_ISSUER: ${COGNITO_ISSUER:-https://cognito-idp.us-east-2.amazonaws.com/us-east-2_PLACEHOLDER}
```

### Frontend Service:
```yaml
frontend:
  environment:
    # ... other vars ...
    NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:-dev-secret-change-in-production}
    COGNITO_CLIENT_ID: ${COGNITO_CLIENT_ID:-placeholder-client-id}
    COGNITO_CLIENT_SECRET: ${COGNITO_CLIENT_SECRET:-placeholder-client-secret}
    COGNITO_ISSUER: ${COGNITO_ISSUER:-https://cognito-idp.us-east-2.amazonaws.com/us-east-2_PLACEHOLDER}
    ENABLE_CREDENTIALS_SIGNIN: ${ENABLE_CREDENTIALS_SIGNIN:-true}
    DATABASE_URL: postgresql://dentia:dentia@postgres:5432/dentia
    BACKEND_API_URL: http://backend:4000
```

**Format**: `${ENV_VAR:-default_value}`
- Reads from `.env` file or environment
- Falls back to default value if not set

---

## Alternative: Local Development Without Docker

If you prefer not to use Docker Compose for development:

### 1. Start only the database:

```bash
docker-compose up postgres localstack -d
```

### 2. Run services locally:

```bash
# Terminal 1: Backend
cd apps/backend
cp .env.example .env  # Edit with your Cognito values
pnpm run dev

# Terminal 2: Frontend
cd apps/frontend
cp .env.example .env.local  # Edit with your Cognito values
pnpm run dev
```

This gives you:
- ✅ Faster development (hot reload)
- ✅ Easier debugging
- ✅ No need to rebuild Docker images
- ✅ Just use Docker for database

---

## Verification

### Check Backend Starts:

```bash
docker-compose logs backend

# Should see:
# [Nest] 1  - XX/XX/XXXX, X:XX:XX PM     LOG [NestApplication] Nest application successfully started
```

### Check Frontend Starts:

```bash
docker-compose logs frontend

# Should see:
# ▲ Next.js 14.x.x
# - Local:        http://localhost:3000
# ✓ Ready in X.Xs
```

### Test the Application:

```bash
# Health check
curl http://localhost:4000/health

# Should return: {"status":"ok"}
```

---

## Troubleshooting

### Still Getting "Cognito issuer is not configured"?

**Check environment variables are being passed:**

```bash
# View backend environment
docker-compose exec backend env | grep COGNITO

# Should show your values, not empty
```

**If empty, check your `.env` file:**

```bash
cat .env

# Make sure it has:
# COGNITO_USER_POOL_ID=...
# COGNITO_CLIENT_ID=...
# etc.
```

### Backend starts but authentication doesn't work?

This means you have placeholder values. Get real Cognito credentials from AWS Console.

### Frontend can't connect to backend?

Check `BACKEND_API_URL` is set:

```bash
docker-compose exec frontend env | grep BACKEND_API_URL

# Should show: http://backend:4000
```

### Need to rebuild after changes?

```bash
docker-compose down
docker-compose build --no-cache
docker-compose up
```

---

## Security Note

**Never commit your `.env` file!**

The `.env` file should be in `.gitignore`:

```bash
# Check it's ignored
cat .gitignore | grep ".env"

# Should see: .env (or *.env)
```

Use `.env.docker` as a template that IS committed (with placeholder values).

---

## Summary

✅ **Updated `docker-compose.yml`** with Cognito environment variables  
✅ **Created `.env.docker`** template file  
✅ **Services now start** with placeholder values  
✅ **Full authentication** available when you add real Cognito credentials  

**To get started:**
1. Copy `.env.docker` to `.env`
2. Fill in your Cognito credentials (or leave placeholders for basic testing)
3. Run `docker-compose up`

Done! 🚀

