# GitHub Secrets Setup for Stripe

You need to add Stripe keys as GitHub Secrets for CI/CD to work.

## Required GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

### Add These Secrets:

**Production (Live) Key:**
- **Name:** `STRIPE_PUBLISHABLE_KEY_PROD`
- **Value:** `your-stripe-live-publishable-key`

**Development (Test) Key:**
- **Name:** `STRIPE_PUBLISHABLE_KEY_DEV`
- **Value:** `pk_test_51SNPE0F4uIWy4U8Oeym4GAm2pF660TYrVr6HuJznY8oa6kJd4rmVBuY2ZRKjVX2Ms8GYbF8tOFTzl5VSA2jGynA600oxAI4nXv`

## How It's Used in CI/CD

**Production Deploy** (`deploy-frontend.yml`):
```yaml
--build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="${{ secrets.STRIPE_PUBLISHABLE_KEY_PROD }}"
```

**Dev Deploy** (`deploy-dev-environment.yml`):
```yaml
--build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="${{ secrets.STRIPE_PUBLISHABLE_KEY_DEV }}"
```

## Verification

After adding the secrets, trigger a deployment and check the build logs. You should **NOT** see the actual key value (GitHub masks secrets in logs).

✅ Your CI/CD workflows have been updated to use these secrets!

