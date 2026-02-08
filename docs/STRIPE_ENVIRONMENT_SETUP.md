# Stripe Environment Variables Setup Guide

This guide explains where and how to set Stripe environment variables for different environments.

## Summary

**Backend (Secret Keys)**:
- Set via Terraform → AWS SSM Parameter Store
- ✅ Already configured in `dentia-infra/infra/ecs/`

**Frontend (Publishable Keys)**:
- Local: `.env.local` file
- Production: Docker build args or ECS environment variables

---

## Backend Environment Variables

### ✅ Already Configured via Terraform

The backend gets Stripe keys from AWS SSM Parameter Store:

```bash
STRIPE_SECRET_KEY          # From SSM: /${project}/${env}/shared/STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET      # From SSM: /${project}/${env}/shared/STRIPE_WEBHOOK_SECRET
```

**Environment Separation:**
- **Production** (`terraform.tfvars`):
  - `stripe_secret_key = "sk_live_YOUR_STRIPE_SECRET_KEY..."`
  - `stripe_webhook_secret = ""` ✅

- **Development** (`environments/dev/terraform.tfvars`):
  - `stripe_secret_key = "sk_test_YOUR_STRIPE_TEST_SECRET_KEY..."`
  - `stripe_webhook_secret = "whsec_YOUR_STRIPE_WEBHOOK_SECRET"` ✅

---

## Frontend Environment Variables

The frontend needs the **publishable key** which is safe to expose publicly.

### Option 1: Local Development

Create `.env.local` in `/Users/shaunk/Projects/Dentia/dentia/apps/frontend/`:

```bash
# .env.local (Local Development - USE TEST KEYS)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY
BACKEND_API_URL=http://localhost:4000
```

**Important**: Add `.env.local` to `.gitignore` (it should already be there).

### Option 2: Production Deployment (ECS)

For production, you have two approaches:

#### Approach A: Build Argument (Recommended)

Update your frontend Dockerfile to accept build args:

**File**: `dentia/infra/docker/frontend.Dockerfile`

```dockerfile
# Add build argument
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# Set as environment variable for Next.js build
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# ... rest of Dockerfile ...
```

Then in your build/deploy script, pass the key:

```bash
# For production build
docker build \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-live-publishable-key \
  -f infra/docker/frontend.Dockerfile \
  -t frontend:latest .

# For dev build
docker build \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY \
  -f infra/docker/frontend.Dockerfile \
  -t frontend:latest .
```

#### Approach B: ECS Task Definition (Runtime - Less Recommended)

Add to ECS task definition environment variables in Terraform:

**File**: `dentia-infra/infra/ecs/services.tf`

Add this to the frontend container environment array:

```hcl
environment = [
  # ... existing vars ...
  { 
    name = "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", 
    value = local.is_prod ? 
      "your-stripe-live-publishable-key" : 
      "pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY"
  }
]
```

**Note**: This approach works but is less ideal because Next.js builds happen at build time, not runtime.

---

## Quick Setup Steps

### 1. Local Development Setup

```bash
cd /Users/shaunk/Projects/Dentia/dentia/apps/frontend

# Create .env.local file
cat > .env.local << 'EOF'
# Stripe (TEST KEYS for local development)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY

# Backend API URL
BACKEND_API_URL=http://localhost:4000
EOF
```

### 2. Backend Local Development Setup

```bash
cd /Users/shaunk/Projects/Dentia/dentia/apps/backend

# Create .env.local file
cat > .env.local << 'EOF'
# Database
DATABASE_URL=your-postgres-connection-string

# Stripe (TEST KEYS for local development)
STRIPE_SECRET_KEY=sk_test_YOUR_STRIPE_TEST_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_STRIPE_WEBHOOK_SECRET

# AWS
AWS_REGION=us-east-2
S3_BUCKET=your-s3-bucket

# Cognito
COGNITO_USER_POOL_ID=your-pool-id
COGNITO_CLIENT_ID=your-client-id
COGNITO_ISSUER=your-issuer
EOF
```

### 3. Verify Setup

Start your services and check:

```bash
# Terminal 1: Backend
cd apps/backend
pnpm run start:dev

# Terminal 2: Frontend
cd apps/frontend
pnpm run dev

# Terminal 3: Stripe CLI (for webhooks)
stripe listen --forward-to localhost:4000/stripe/webhook
```

Navigate to: `http://localhost:3000/onboarding`

---

## Environment Key Summary

| Environment | Backend Keys | Frontend Keys | Webhook Secret |
|-------------|--------------|---------------|----------------|
| **Local Dev** | Test (sk_test_YOUR_STRIPE_TEST_SECRET_KEY...) | Test (pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY...) | Test (from Stripe CLI) |
| **Dev (ECS)** | Test (via Terraform) | Test (build arg or runtime) | Test (whsec_YOUR_STRIPE_WEBHOOK_SECRET...) |
| **Production** | Live (via Terraform) | Live (build arg or runtime) | Live (whsec_YOUR_STRIPE_WEBHOOK_SECRET...) |

---

## Security Checklist

- ✅ Test keys in development
- ✅ Live keys in production only
- ✅ Backend keys in SSM Parameter Store (secrets)
- ✅ Frontend keys can be public (publishable keys only)
- ✅ Webhook secrets environment-specific
- ✅ No keys committed to git
- ✅ `.env.local` in `.gitignore`

---

## Terraform Deployment

Your current Terraform configuration is now **correct**:

### Production
```bash
cd dentia-infra/infra/ecs
terraform apply
```

This uses `terraform.tfvars`:
- `stripe_secret_key`: Live key (sk_live_YOUR_STRIPE_SECRET_KEY...)
- `stripe_publishable_key`: Live key (pk_live_YOUR_STRIPE_PUBLISHABLE_KEY...)
- `stripe_webhook_secret`: Production webhook (whsec_YOUR_STRIPE_WEBHOOK_SECRET...)

### Development
```bash
cd dentia-infra/infra/environments/dev
terraform apply
```

This uses `dev/terraform.tfvars`:
- `stripe_secret_key`: Test key (sk_test_YOUR_STRIPE_TEST_SECRET_KEY...)
- `stripe_publishable_key`: Test key (pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY...)
- `stripe_webhook_secret`: Test webhook (whsec_YOUR_STRIPE_WEBHOOK_SECRET...)

---

## Troubleshooting

### Issue: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured"

**Solution**: 
1. Check `.env.local` exists in `apps/frontend/`
2. Restart Next.js dev server
3. Verify the key starts with `pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY` or `pk_live_YOUR_STRIPE_PUBLISHABLE_KEY`

### Issue: Webhook signature verification failed

**Solution**:
1. Check `STRIPE_WEBHOOK_SECRET` matches your environment
2. For local dev: Use the secret from `stripe listen` command
3. For production: Use the secret from Stripe Dashboard webhook settings

### Issue: Using wrong keys in wrong environment

**Solution**:
1. Double-check `.env.local` files have TEST keys
2. Verify Terraform applies to correct environment
3. Check ECS task definition environment variables

---

## CI/CD Integration

If using GitHub Actions or similar:

```yaml
# .github/workflows/deploy-frontend.yml
- name: Build Frontend
  env:
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${{ secrets.STRIPE_PUBLISHABLE_KEY_PROD }}
  run: |
    cd apps/frontend
    pnpm build
```

Store these in your CI/CD secrets:
- `STRIPE_PUBLISHABLE_KEY_TEST`
- `STRIPE_PUBLISHABLE_KEY_PROD`

---

## Next Steps

1. ✅ Verify webhook secrets are correctly set in Terraform
2. ✅ Create `.env.local` files for local development
3. ✅ Update Dockerfile to accept build args (if using Approach A)
4. ✅ Test locally with `pnpm run dev`
5. ✅ Deploy to dev environment first
6. ✅ Verify dev uses test keys
7. ✅ Deploy to production
8. ✅ Verify production uses live keys

---

## Support

If you encounter issues:
1. Check this guide first
2. Review `STRIPE_TESTING_GUIDE.md`
3. Verify environment variables are loaded: `echo $NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
4. Check browser console for Stripe errors
5. Check backend logs for authentication errors

