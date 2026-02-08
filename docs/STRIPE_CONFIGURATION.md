# Stripe Configuration Guide

This document describes how Stripe billing keys are configured in the Parlae/Dentia application.

## Overview

Stripe keys have been added to the configuration system with automatic environment-based selection:
- **Test keys** are used for development and staging environments
- **Production keys** are used for production environment

## Configuration Files

### 1. Main Configuration (`config.sh`)

The Stripe keys are configured in `/config.sh`:

```bash
#=============================================================================
# STRIPE BILLING
#=============================================================================
# Development/Test Keys (for local development and testing)
export STRIPE_PUBLISHABLE_KEY_TEST="pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY"
export STRIPE_SECRET_KEY_TEST="sk_test_YOUR_STRIPE_TEST_SECRET_KEY"

# Production Keys (for production environment)
export STRIPE_PUBLISHABLE_KEY_PROD="pk_live_YOUR_STRIPE_PUBLISHABLE_KEY"
export STRIPE_SECRET_KEY_PROD="sk_live_YOUR_STRIPE_SECRET_KEY"

# Active Keys (automatically selected based on ENVIRONMENT)
export STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY_PROD}"
export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY_PROD}"
export NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY}"

# Set to test keys if not in production
if [[ "$ENVIRONMENT" != "production" ]]; then
  export STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY_TEST}"
  export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY_TEST}"
  export NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY}"
fi
```

### 2. Docker Compose (`dentia/docker-compose.yml`)

The Docker Compose file has been updated to pass Stripe environment variables to both backend and frontend services:

**Backend Service:**
```yaml
environment:
  STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:-}
  STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:-}
```

**Frontend Service:**
```yaml
build:
  args:
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
environment:
  STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:-}
  STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:-}
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:-}
```

## Environment Variables

### Backend (NestJS)
The backend uses these environment variables:
- `STRIPE_SECRET_KEY` - Secret key for server-side Stripe API calls
- `STRIPE_WEBHOOK_SECRET` - Webhook signing secret (to be configured when setting up webhooks)

### Frontend (Next.js)
The frontend uses these environment variables:
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Publishable key for client-side Stripe.js (must be prefixed with `NEXT_PUBLIC_`)
- `STRIPE_SECRET_KEY` - Secret key for server-side API routes

## Key Types

### Test Keys (Development)
- **Publishable Key**: `pk_test_YOUR_STRIPE_TEST_PUBLISHABLE_KEY...`
- **Secret Key**: `sk_test_YOUR_STRIPE_TEST_SECRET_KEY...`
- Used for: Local development, staging, testing

### Production Keys
- **Publishable Key**: `pk_live_YOUR_STRIPE_PUBLISHABLE_KEY...`
- **Secret Key**: `sk_live_YOUR_STRIPE_SECRET_KEY...`
- Used for: Production environment only

## Automatic Key Selection

The configuration automatically selects the appropriate keys based on the `ENVIRONMENT` variable:

```bash
# In config.sh
if [[ "$ENVIRONMENT" != "production" ]]; then
  # Use test keys
  export STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY_TEST}"
  export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY_TEST}"
else
  # Use production keys
  export STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY_PROD}"
  export STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY_PROD}"
fi
```

## Usage in Code

### Backend (NestJS)
The backend Stripe service reads the secret key from environment variables:

```typescript
// apps/backend/src/stripe/services/stripe.service.ts
const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
```

### Frontend (Next.js)
The frontend loads the publishable key for client-side operations:

```typescript
// Frontend components
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
);
```

## Setting Up Webhooks

To complete the Stripe integration, you need to set up webhooks:

1. **Development/Test Webhooks**:
   - Go to https://dashboard.stripe.com/test/webhooks
   - Create a new webhook endpoint
   - Set URL to: `https://your-dev-domain.com/api/billing/webhook`
   - Copy the signing secret and add to config as `STRIPE_WEBHOOK_SECRET`

2. **Production Webhooks**:
   - Go to https://dashboard.stripe.com/webhooks
   - Create a new webhook endpoint
   - Set URL to: `https://app.parlae.ca/api/billing/webhook`
   - Copy the signing secret and add to config as `STRIPE_WEBHOOK_SECRET`

### Required Webhook Events

Configure your webhooks to listen for these events:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never commit `config.sh`** to version control (it's in `.gitignore`)
2. **Test keys** can be safely used in development environments
3. **Production keys** should only be used in production and stored securely
4. **Publishable keys** (pk_*) are safe to expose in client-side code
5. **Secret keys** (sk_*) must NEVER be exposed to the client
6. **Webhook secrets** (whsec_YOUR_STRIPE_WEBHOOK_SECRET*) must be kept secure

## Deployment

### AWS Parameter Store / Secrets Manager

For production deployment, store these as secure parameters:

```bash
# Test environment
/parlae/test/stripe/publishable-key
/parlae/test/stripe/secret-key
/parlae/test/stripe/webhook-secret

# Production environment
/parlae/production/stripe/publishable-key
/parlae/production/stripe/secret-key
/parlae/production/stripe/webhook-secret
```

### Docker Build Arguments

When building the frontend Docker image, pass the publishable key as a build argument:

```bash
docker build \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="$STRIPE_PUBLISHABLE_KEY" \
  -f infra/docker/frontend.Dockerfile \
  .
```

## Testing

### Local Development
1. Source the config file: `source config.sh`
2. Run the development environment: `./dentia/dev.sh`
3. The test keys will be automatically used

### Verify Configuration
```bash
# Check which keys are active
echo $STRIPE_PUBLISHABLE_KEY
echo $NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# Should show test keys in development
# Should show production keys when ENVIRONMENT=production
```

## Troubleshooting

### "Stripe publishable key is not configured"
- Ensure `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set
- For Docker builds, ensure it's passed as a build argument
- Check that `config.sh` is sourced before running services

### "STRIPE_SECRET_KEY is not configured"
- Ensure backend has access to `STRIPE_SECRET_KEY` environment variable
- Check Docker Compose environment section
- Verify the key starts with `sk_test_YOUR_STRIPE_TEST_SECRET_KEY` or `sk_live_YOUR_STRIPE_SECRET_KEY`

### Wrong keys being used
- Check the `ENVIRONMENT` variable: `echo $ENVIRONMENT`
- Ensure `config.sh` is sourced: `source config.sh`
- Restart services after changing environment variables

## References

- [Stripe API Keys Documentation](https://stripe.com/docs/keys)
- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Stripe Testing Documentation](https://stripe.com/docs/testing)


