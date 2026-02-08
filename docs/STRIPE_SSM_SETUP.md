# Stripe SSM Parameters Setup Guide

## Quick Summary

✅ **Backend Secrets**: Use your existing SSM scripts (already updated with Stripe keys)  
⚠️ **Frontend Build**: Needs `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` at Docker build time

---

## Backend Setup (SSM Parameters)

### Production Environment

Run your existing script with the **LIVE** Stripe keys:

```bash
cd /Users/shaunk/Projects/Dentia/dentia-infra

# Upload production secrets (includes LIVE Stripe keys)
./infra/scripts/put-ssm-secrets.sh dentia us-east-2
```

This script now uploads:
```
/dentia/shared/STRIPE_PUBLISHABLE_KEY    = pk_live_YOUR_STRIPE_PUBLISHABLE_KEY...
/dentia/shared/STRIPE_SECRET_KEY         = sk_live_YOUR_STRIPE_SECRET_KEY... (SecureString)
/dentia/shared/STRIPE_WEBHOOK_SECRET     = whsec_YOUR_STRIPE_WEBHOOK_SECRET (SecureString)
```

### Development Environment

Run the dev script with **TEST** Stripe keys:

```bash
cd /Users/shaunk/Projects/Dentia/dentia-infra

# Upload dev secrets (includes TEST Stripe keys)
./infra/scripts/put-ssm-secrets-dev.sh dentia
```

This script now uploads:
```
/dentia/dev/shared/STRIPE_PUBLISHABLE_KEY    = pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY...
/dentia/dev/shared/STRIPE_SECRET_KEY         = sk_test_YOUR_STRIPE_TEST_SECRET_KEY... (SecureString)
/dentia/dev/shared/STRIPE_WEBHOOK_SECRET     = whsec_YOUR_STRIPE_WEBHOOK_SECRET (SecureString)
```

---

## Frontend Setup (Docker Build)

### Why Docker Build Args?

**The Issue**: Next.js variables with `NEXT_PUBLIC_` prefix are **baked into the JavaScript bundle at BUILD time**, not loaded at runtime.

**Why?**: These variables run in the user's browser, not on your server. Next.js replaces them with actual values during the build process.

**Is it secure?**: Yes! Stripe **publishable keys** are designed to be public. They can safely appear in client-side code.

### Build Commands

**Production Build** (Live Key):
```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Build with LIVE Stripe key
./scripts/build-frontend-docker.sh prod
```

**Development Build** (Test Key):
```bash
cd /Users/shaunk/Projects/Dentia/dentia

# Build with TEST Stripe key
./scripts/build-frontend-docker.sh dev
```

Or manually:
```bash
# Production
docker build \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="your-stripe-live-publishable-key" \
  -f infra/docker/frontend.Dockerfile \
  -t frontend:prod \
  .

# Development
docker build \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY" \
  -f infra/docker/frontend.Dockerfile \
  -t frontend:dev \
  .
```

---

## Local Development Setup

For local development (no Docker), create `.env.local` files:

### Frontend
```bash
cd /Users/shaunk/Projects/Dentia/dentia/apps/frontend

cat > .env.local << 'EOF'
# Stripe (TEST keys for local dev)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY

# Backend API
BACKEND_API_URL=http://localhost:4000
EOF
```

### Backend
```bash
cd /Users/shaunk/Projects/Dentia/dentia/apps/backend

cat > .env.local << 'EOF'
# Database
DATABASE_URL=your-postgres-url

# Stripe (TEST keys for local dev)
STRIPE_SECRET_KEY=sk_test_YOUR_STRIPE_TEST_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_STRIPE_WEBHOOK_SECRET

# Other vars...
AWS_REGION=us-east-2
S3_BUCKET=your-bucket
COGNITO_USER_POOL_ID=your-pool-id
COGNITO_CLIENT_ID=your-client-id
COGNITO_ISSUER=your-issuer
EOF
```

---

## Key Differences: Backend vs Frontend

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **When loaded** | Runtime (container starts) | Build time (Docker build) |
| **Where stored** | SSM Parameter Store | Baked into JS bundle |
| **How accessed** | ECS loads from SSM | Build arg during Docker build |
| **Secret type** | Secret key (private) | Publishable key (public) |
| **Environment vars** | `STRIPE_SECRET_KEY` | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |

---

## Verification Steps

### 1. Verify SSM Parameters Were Created

**Production:**
```bash
aws ssm get-parameter \
  --name "/dentia/shared/STRIPE_SECRET_KEY" \
  --with-decryption \
  --profile dentia \
  --region us-east-2

aws ssm get-parameter \
  --name "/dentia/shared/STRIPE_WEBHOOK_SECRET" \
  --with-decryption \
  --profile dentia \
  --region us-east-2
```

**Development:**
```bash
aws ssm get-parameter \
  --name "/dentia/dev/shared/STRIPE_SECRET_KEY" \
  --with-decryption \
  --profile dentia \
  --region us-east-2
```

### 2. Verify Backend Can Access Secrets

Check ECS task definition includes the SSM parameter ARNs in the `secrets` section.

### 3. Verify Frontend Build Includes Key

After building the Docker image, you can check the built JavaScript:
```bash
docker run --rm frontend:prod grep -r "pk_live" /app/apps/frontend/apps/web/.next/static
```

You should see the publishable key embedded in the JS files.

---

## Complete Deployment Flow

### Production Deployment

```bash
# Step 1: Upload SSM parameters
cd /Users/shaunk/Projects/Dentia/dentia-infra
./infra/scripts/put-ssm-secrets.sh

# Step 2: Build backend (no special args needed)
cd /Users/shaunk/Projects/Dentia/dentia
docker build -f infra/docker/backend.Dockerfile -t backend:prod .

# Step 3: Build frontend with LIVE key
./scripts/build-frontend-docker.sh prod

# Step 4: Push to ECR and deploy
# (your existing deployment process)
```

### Development Deployment

```bash
# Step 1: Upload dev SSM parameters
cd /Users/shaunk/Projects/Dentia/dentia-infra
./infra/scripts/put-ssm-secrets-dev.sh

# Step 2: Build backend
cd /Users/shaunk/Projects/Dentia/dentia
docker build -f infra/docker/backend.Dockerfile -t backend:dev .

# Step 3: Build frontend with TEST key
./scripts/build-frontend-docker.sh dev

# Step 4: Push to ECR and deploy
```

---

## Troubleshooting

### Backend can't connect to Stripe
- Verify SSM parameter exists: `aws ssm get-parameter --name "/dentia/shared/STRIPE_SECRET_KEY" --with-decryption`
- Check ECS task definition includes SSM secret reference
- Check CloudWatch logs for "STRIPE_SECRET_KEY is not configured"

### Frontend shows "Stripe key not configured"
- Verify key was passed during Docker build
- Check browser console for the error
- Inspect the built JS files to confirm key is embedded
- Rebuild Docker image with correct build arg

### Using wrong environment keys
- Double-check which script you ran (`put-ssm-secrets.sh` vs `put-ssm-secrets-dev.sh`)
- Verify build script uses correct environment (`prod` vs `dev`)
- Check ECS task is reading from correct SSM path (`/dentia/*` vs `/dentia/dev/*`)

---

## Security Notes

✅ **Publishable keys are safe to expose** - They're designed for client-side use  
✅ **Secret keys stay in SSM** - Never exposed to clients  
✅ **Test keys in dev** - Production keys only in prod environment  
✅ **No keys in git** - Everything loaded from SSM or build args  

---

## What Changed from Terraform Approach

**Before**: Terraform created SSM parameters from `terraform.tfvars`  
**After**: Your existing SSM scripts create SSM parameters

**Advantages**:
- ✅ Consistent with your existing infrastructure management
- ✅ One place to manage all secrets (your scripts)
- ✅ Can rotate secrets without Terraform apply
- ✅ Scripts can be run independently

**Terraform now only**:
- Defines the variables (for documentation)
- References SSM parameters in ECS task definitions
- Does NOT create the SSM parameters themselves

