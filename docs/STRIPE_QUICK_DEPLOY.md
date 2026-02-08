# Stripe Integration - Quick Deploy Guide

## TL;DR

**Backend**: Loads secrets from SSM at runtime ✅  
**Frontend**: Needs publishable key baked into JS at build time ⚠️

---

## Step 1: Upload SSM Parameters (One Time)

### Production
```bash
cd /Users/shaunk/Projects/Dentia/dentia-infra
./infra/scripts/put-ssm-secrets.sh
```
✅ Uploads LIVE Stripe keys to `/dentia/shared/STRIPE_*`

### Development
```bash
cd /Users/shaunk/Projects/Dentia/dentia-infra
./infra/scripts/put-ssm-secrets-dev.sh
```
✅ Uploads TEST Stripe keys to `/dentia/dev/shared/STRIPE_*`

---

## Step 2: Local Development

```bash
# Terminal 1: Backend
cd /Users/shaunk/Projects/Dentia/dentia/apps/backend
cat > .env.local << 'EOF'
DATABASE_URL=your-postgres-url
STRIPE_SECRET_KEY=sk_test_YOUR_STRIPE_TEST_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_STRIPE_WEBHOOK_SECRET
EOF
pnpm run start:dev

# Terminal 2: Frontend
cd /Users/shaunk/Projects/Dentia/dentia/apps/frontend
cat > .env.local << 'EOF'
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY
BACKEND_API_URL=http://localhost:4000
EOF
pnpm run dev

# Terminal 3: Stripe Webhooks
stripe listen --forward-to localhost:4000/stripe/webhook
```

Test at: `http://localhost:3000/onboarding`

---

## Step 3: Docker Build

### Production
```bash
cd /Users/shaunk/Projects/Dentia/dentia
./scripts/build-frontend-docker.sh prod
```

### Development  
```bash
cd /Users/shaunk/Projects/Dentia/dentia
./scripts/build-frontend-docker.sh dev
```

---

## Step 4: Deploy

Your existing deployment process unchanged - just make sure:
1. ECS tasks can read from SSM
2. Frontend image built with correct environment key

---

## Why Frontend Needs Build-Time Key?

**Next.js Limitation**: Variables prefixed with `NEXT_PUBLIC_` get replaced during build and embedded in JavaScript bundle that runs in browsers.

**Safe?**: Yes! Stripe publishable keys are designed to be public.

---

## Verification Checklist

- [ ] SSM parameters uploaded (run scripts)
- [ ] Local dev works with test keys
- [ ] Backend connects to Stripe ✓
- [ ] Frontend checkout loads ✓
- [ ] Webhooks process correctly ✓
- [ ] Production uses LIVE keys only
- [ ] Development uses TEST keys only

---

## Key Locations

**Your SSM Scripts** (✅ Updated):
- `/Users/shaunk/Projects/Dentia/dentia-infra/infra/scripts/put-ssm-secrets.sh` (LIVE)
- `/Users/shaunk/Projects/Dentia/dentia-infra/infra/scripts/put-ssm-secrets-dev.sh` (TEST)

**Frontend Build Script** (✅ Created):
- `/Users/shaunk/Projects/Dentia/dentia/scripts/build-frontend-docker.sh`

**Terraform** (✅ Configured):
- Variables defined (for reference)
- ECS tasks load from SSM
- **Does NOT create SSM parameters** (your scripts do that)

---

## Test Cards

- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

---

## Quick Troubleshooting

**"Stripe key not configured" in frontend**
→ Rebuild Docker image with correct build arg

**"Webhook signature failed"**
→ Check `STRIPE_WEBHOOK_SECRET` matches your environment

**Backend can't connect to Stripe**
→ Verify SSM parameter exists and ECS can read it

---

## Full Documentation

- `STRIPE_SSM_SETUP.md` - Detailed SSM and Docker setup
- `STRIPE_INTEGRATION_GUIDE.md` - Complete architecture guide
- `STRIPE_TESTING_GUIDE.md` - Comprehensive testing procedures
- `STRIPE_IMPLEMENTATION_SUMMARY.md` - What was built

---

**Ready to Deploy!** 🚀

