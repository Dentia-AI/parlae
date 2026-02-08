# ECR Deployment Guide

Quick guide for building and pushing Docker images to AWS ECR.

## 🚀 Quick Commands

### Using the Helper Script (Easiest)

```bash
# Build and push both services to production
./scripts/build-and-push-ecr.sh both prod

# Build and push only frontend
./scripts/build-and-push-ecr.sh frontend prod

# Build and push only backend
./scripts/build-and-push-ecr.sh backend prod

# Build and push to dev environment
./scripts/build-and-push-ecr.sh both dev
```

### Manual Build (Alternative)

#### Frontend
```bash
# Simple - uses default Stripe key from Dockerfile
docker build --no-cache --platform linux/amd64 \
  -t dentia-frontend \
  -f infra/docker/frontend.Dockerfile .

# Or override the Stripe key
docker build --no-cache --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..." \
  -t dentia-frontend \
  -f infra/docker/frontend.Dockerfile .
```

#### Backend
```bash
docker build --no-cache --platform linux/amd64 \
  -t dentia-backend \
  -f infra/docker/backend.Dockerfile .
```

## 📋 Complete Workflow

### 1. Build and Push to ECR

```bash
# Use the helper script
./scripts/build-and-push-ecr.sh both prod
```

The script will:
- ✅ Login to ECR
- ✅ Build images with correct platform (linux/amd64)
- ✅ Tag with `:latest`
- ✅ Use correct Stripe keys for environment
- ✅ Push to ECR
- ✅ Show you the next steps

### 2. Deploy to ECS

Force new deployment to use the new image:

```bash
# Frontend
aws ecs update-service \
  --cluster dentia-prod \
  --service dentia-prod-frontend \
  --force-new-deployment \
  --profile dentia \
  --region us-east-2

# Backend
aws ecs update-service \
  --cluster dentia-prod \
  --service dentia-prod-backend \
  --force-new-deployment \
  --profile dentia \
  --region us-east-2
```

### 3. Monitor Deployment

```bash
# Watch service status
aws ecs describe-services \
  --cluster dentia-prod \
  --services dentia-prod-frontend dentia-prod-backend \
  --profile dentia \
  --region us-east-2 \
  | jq '.services[] | {name: .serviceName, desired: .desiredCount, running: .runningCount, status: .status}'

# Watch task logs (CloudWatch)
# Go to: https://console.aws.amazon.com/cloudwatch/home?region=us-east-2#logsV2:log-groups
```

## 🔑 About Build Arguments

### Why `NEXT_PUBLIC_*` Variables Are Special

**`NEXT_PUBLIC_*` variables in Next.js are embedded at build time**, not runtime:

1. ❌ **SSM parameters won't work** for `NEXT_PUBLIC_*` vars because they're only available at runtime
2. ✅ **Build args are required** to embed these values into the JavaScript bundle
3. ✅ **Dockerfile has defaults** so simple builds work without args

### Frontend Build Arguments

The `frontend.Dockerfile` includes these build-time variables with sensible defaults:

#### Required Variables (with defaults)
```dockerfile
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_51SNPE0..."
ARG NEXT_PUBLIC_PRODUCT_NAME="Dentia"
ARG NEXT_PUBLIC_SITE_TITLE="Dentia - Social Media Management Platform"
ARG NEXT_PUBLIC_SITE_DESCRIPTION="Manage your social media presence..."
ARG NEXT_PUBLIC_SITE_URL="https://app.dentiaapp.com"
ARG NEXT_PUBLIC_DEFAULT_LOCALE="en"
ARG NEXT_PUBLIC_DEFAULT_THEME_MODE="system"
ARG NEXT_PUBLIC_THEME_COLOR="#FAFAFA"
ARG NEXT_PUBLIC_THEME_COLOR_DARK="#0A0A0A"
```

#### GoHighLevel Variables (no defaults)

These control the chat widget + calendar embeds and **must** be supplied at build time:

- `NEXT_PUBLIC_GHL_WIDGET_ID`
- `NEXT_PUBLIC_GHL_LOCATION_ID`
- `NEXT_PUBLIC_GHL_CALENDAR_ID`

The helper scripts (`build-and-push-ecr.sh` and `build-frontend-docker.sh`) now automatically read these from your environment variables or from AWS SSM (`/dentia/<env>/frontend/...`). Set them manually if you run `docker build` directly.

#### What This Means

- ✅ **Simple build works**: `docker build -f infra/docker/frontend.Dockerfile .`
- ✅ **Override if needed**: `--build-arg NEXT_PUBLIC_SITE_URL="https://dev.dentiaapp.com"`
- ✅ **Helper script handles it automatically** - sets correct Stripe key, site URL, and GoHighLevel IDs

### Backend - No Build Args Needed ✅

The backend Dockerfile doesn't need ANY build arguments:
- All configuration comes from SSM Parameter Store at runtime
- Platform API keys are loaded when the container starts
- No rebuild needed when changing secrets

### Runtime vs Build Time

| Type | Variables | How Loaded |
|------|-----------|------------|
| **Frontend NEXT_PUBLIC_*** | Public client-side vars | ⚙️ Build args (embedded in JS) |
| **Frontend Server** | Database, auth, etc. | 🔐 SSM at runtime |
| **Backend** | All secrets | 🔐 SSM at runtime |
| **Local Development** | All vars | 📝 `.env` file |

### Other Environment Variables

All secrets (database, auth, platform APIs, etc.) come from:
- **Local**: `.env` file via `docker-compose.yml`
- **Production**: AWS SSM Parameter Store loaded at runtime

## 🔧 Troubleshooting

### Build fails with "no space left on device"

```bash
# Clean up Docker
docker system prune -a --volumes
```

### Wrong architecture (arm64 vs amd64)

Make sure you use `--platform linux/amd64`:

```bash
docker build --platform linux/amd64 ...
```

### ECR login fails

```bash
# Re-login
aws ecr get-login-password --region us-east-2 --profile dentia | \
  docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.us-east-2.amazonaws.com
```

### Image pushed but service not updating

```bash
# Force new deployment
aws ecs update-service \
  --cluster dentia-prod \
  --service dentia-prod-frontend \
  --force-new-deployment \
  --profile dentia
```

### Check if new tasks are starting

```bash
aws ecs list-tasks \
  --cluster dentia-prod \
  --service-name dentia-prod-frontend \
  --profile dentia

aws ecs describe-tasks \
  --cluster dentia-prod \
  --tasks <task-arn> \
  --profile dentia
```

## 📚 Related Documentation

- [Platform API Keys Setup](./PLATFORM_API_KEYS.md)
- [Infrastructure Guide](../../dentia-infra/docs/README.md)
- [Stripe Setup](./STRIPE_ENVIRONMENT_SETUP.md)

## 💡 Tips

1. **Test locally first**: Use `docker-compose` to test changes before pushing to ECR
2. **Monitor CloudWatch**: Always check logs after deployment
3. **Dev environment**: Test in dev before pushing to production
4. **Always use :latest**: The script only pushes to the `:latest` tag for simplicity

## 🎯 Quick Reference

| Environment | ECR Frontend | ECR Backend |
|-------------|-------------|-------------|
| Production | `dentia-prod-frontend` | `dentia-prod-backend` |
| Dev | `dentia-dev-frontend` | `dentia-dev-backend` |

| Stripe Key | Environment | Starts with |
|------------|-------------|-------------|
| Production | Live | `pk_live_` |
| Dev/Test | Test | `pk_test_` |
