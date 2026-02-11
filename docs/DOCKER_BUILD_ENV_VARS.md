# Docker Build Environment Variables

## Overview

The frontend Docker build requires certain environment variables to be available **during the Next.js build phase**, even though they are only used at runtime. This is because Next.js validates module imports and configuration at build time.

## Auth Environment Variables

### Build-Time Requirements

These variables must be present during `next build`:

- `COGNITO_CLIENT_ID`
- `COGNITO_CLIENT_SECRET`
- `COGNITO_ISSUER`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

### Dummy Values for Build

The `frontend.Dockerfile` provides **dummy values** for these variables during the Docker build:

```dockerfile
ARG COGNITO_CLIENT_ID="dummy-client-id-for-docker-build"
ARG COGNITO_CLIENT_SECRET="dummy-client-secret-for-docker-build"
ARG COGNITO_ISSUER="https://cognito-idp.us-east-1.amazonaws.com/dummy-pool-for-build"
ARG NEXTAUTH_SECRET="dummy-nextauth-secret-minimum-32-characters-required-for-build"
ARG NEXTAUTH_URL="https://www.parlae.ca"
```

These dummy values:
- ✅ Allow the Next.js build to complete successfully
- ✅ Pass the module-level validation in `nextauth.ts`
- ✅ Are **NOT used at runtime**
- ✅ Are detected by checking if they contain "dummy"

### Runtime Values

The **actual** Cognito credentials are provided at runtime via:

1. **ECS Task Definition** - Environment variables in the container configuration
2. **AWS Secrets Manager** - Fetched by the container at startup
3. **Environment Variables** - Set by the container orchestrator

## How It Works

### 1. Production Build (GitHub Actions)

**Real values from GitHub Secrets:**
```yaml
docker buildx build \
  --build-arg COGNITO_CLIENT_ID="${{ secrets.COGNITO_CLIENT_ID }}" \
  --build-arg COGNITO_CLIENT_SECRET="${{ secrets.COGNITO_CLIENT_SECRET }}" \
  # ... real production values
```

These are sourced from Terraform outputs and stored as GitHub Secrets.

### 2. Local CI Build (Testing)

**Dummy values for test builds:**
```yaml
env:
  COGNITO_CLIENT_ID: dummy-client-id-for-build
  COGNITO_CLIENT_SECRET: dummy-client-secret-for-build
```

During build, `nextauth.ts` checks:

```typescript
const hasDummyValues = requiredVars.some(v => 
  process.env[v]?.includes('dummy-client-id-for-build')
);

// Only validate if NOT using dummy values
if (isProduction && !hasDummyValues) {
  // Validate required env vars
}
```

### 3. Runtime Phase (Container Start)

When the container starts:
1. Values are already in the Docker image (from build args)
2. ECS can also override with Task Definition environment variables
3. Application validates them (no "dummy" in production values)
4. Auth works normally

## CI/CD Pipeline

### Test/Build Workflows

The GitHub Actions workflows also use dummy values:

```yaml
- name: Build frontend
  run: pnpm --filter web build
  env:
    COGNITO_CLIENT_ID: dummy-client-id-for-build
    COGNITO_CLIENT_SECRET: dummy-client-secret-for-build
    COGNITO_ISSUER: https://cognito-idp.us-east-1.amazonaws.com/dummy-pool
    NEXTAUTH_SECRET: dummy-nextauth-secret-for-build-only
```

### Deployment Workflow

The deployment workflow passes **real production values** from GitHub Secrets:

```yaml
docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="${{ secrets.STRIPE_PUBLISHABLE_KEY_PROD }}" \
  --build-arg COGNITO_CLIENT_ID="${{ secrets.COGNITO_CLIENT_ID }}" \
  --build-arg COGNITO_CLIENT_SECRET="${{ secrets.COGNITO_CLIENT_SECRET }}" \
  --build-arg COGNITO_ISSUER="${{ secrets.COGNITO_ISSUER }}" \
  --build-arg NEXTAUTH_SECRET="${{ secrets.NEXTAUTH_SECRET }}" \
  -t "$IMAGE_URI" \
  -f infra/docker/frontend.Dockerfile \
  --push \
  .
```

These secrets are populated from Terraform outputs. See [GITHUB_SECRETS_SETUP.md](./GITHUB_SECRETS_SETUP.md) for setup instructions.

## Security Considerations

### ✅ Secure

- Dummy values in Docker image are harmless
- Real credentials never in Dockerfile or git
- Real credentials only in AWS Secrets Manager
- Container only gets real credentials at runtime

### ⚠️ Important

- **Never** commit real Cognito credentials to git
- **Never** pass real credentials as Docker build args
- **Always** use AWS Secrets Manager for production
- **Always** rotate credentials if exposed

## Local Development

For local development, use `.env.local`:

```bash
COGNITO_CLIENT_ID=your-dev-client-id
COGNITO_CLIENT_SECRET=your-dev-client-secret
COGNITO_ISSUER=https://cognito-idp.region.amazonaws.com/pool-id
NEXTAUTH_SECRET=your-local-secret-32-chars-minimum
NEXTAUTH_URL=http://localhost:3000
```

The code detects non-dummy values and validates them properly.

## Troubleshooting

### Build Error: "COGNITO_CLIENT_ID is not set"

**Cause:** Environment variable not provided during build

**Fix:** Ensure dummy values are in:
- `frontend.Dockerfile` (for Docker builds)
- Workflow YAML files (for CI builds)
- Or use `.env.local` (for local builds)

### Runtime Error: Auth not working

**Cause:** Real credentials not provided to running container

**Fix:** Check:
1. ECS Task Definition has correct environment variables
2. AWS Secrets Manager has the credentials
3. IAM role has permission to read secrets
4. Container logs for auth errors

### Warning: "Using dummy Cognito values"

**Expected in:**
- CI/CD builds
- Docker image builds
- Test environments

**Not expected in:**
- Production runtime
- Staging runtime
- Any deployed environment

## Related Files

- `infra/docker/frontend.Dockerfile` - Dockerfile with dummy values
- `apps/frontend/packages/shared/src/auth/nextauth.ts` - Auth config with validation
- `.github/workflows/test-frontend.yml` - CI workflow with dummy values
- `.github/workflows/deploy-frontend.yml` - Deployment workflow

## Summary

| Phase | Location | Values |
|-------|----------|--------|
| **Build (Docker)** | Dockerfile ARG/ENV | Dummy values with "dummy" string |
| **Build (CI)** | Workflow YAML env | Dummy values with "dummy" string |
| **Runtime (Local)** | `.env.local` | Real dev credentials |
| **Runtime (Prod)** | ECS Task Definition + Secrets Manager | Real prod credentials |

The key insight: **Build-time validation is skipped when dummy values are detected**, allowing the image to build successfully while ensuring runtime validation still works.
