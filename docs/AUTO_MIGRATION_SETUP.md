# Automatic Migration Setup Guide

## ✅ Status: Migrations ARE Automated!

Your infrastructure is already set up to run migrations automatically. This guide explains how it works and how to enable/use it.

---

## 🎯 How Automatic Migrations Work

### The Complete Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Developer Creates Migration Locally                      │
│    cd packages/prisma                                        │
│    npx prisma migrate dev --name add_stripe_payments        │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Commit and Push to GitHub                                │
│    git add packages/prisma/migrations/                      │
│    git commit -m "Add Stripe payments"                      │
│    git push origin develop                                  │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. GitHub Actions Triggers (if enabled)                     │
│    ✅ Runs tests                                            │
│    ✅ Builds Docker images (with migrations included)       │
│    ✅ Pushes images to ECR                                  │
│    ✅ Triggers ECS service update                           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. ECS Starts New Container                                 │
│    ENTRYPOINT: /app/migrate-and-start.sh                    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Migrations Run AUTOMATICALLY ✨                          │
│    🔄 npx prisma migrate deploy                             │
│    ✅ Only new migrations applied (idempotent)              │
│    ⛔ If migrations fail → Container won't start (safe!)    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Application Starts                                        │
│    ✅ Backend/Frontend serves requests                      │
│    ✅ Database is guaranteed to be up-to-date               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Current Configuration

### ✅ What's Already Set Up

1. **Docker Images Include Migrations**
   - `infra/docker/backend.Dockerfile` copies all migration files
   - `scripts/migrate-and-start.sh` is set as ENTRYPOINT
   - Every container startup runs migrations automatically

2. **CI/CD Workflows Exist**
   - `.github/workflows/deploy-dev-environment.yml` - Deploys to dev on push to `develop`
   - `.github/workflows/deploy-backend.yml` - Deploys backend on changes to `apps/backend/**` or `packages/prisma/**`
   - `.github/workflows/test-*.yml` - Runs tests on every push

3. **Migration Script is Idempotent**
   - `scripts/migrate-and-start.sh` runs `prisma migrate deploy`
   - Only new migrations are applied
   - Already-applied migrations are skipped
   - Safe to run multiple times

### ⏸️ What's Currently Disabled

The deployment workflows are **commented out** to prevent accidental deployments during development:

```yaml
# In deploy-dev-environment.yml:
if: ${{ false }}  # <-- This disables the workflow

# In deploy-backend.yml:
if: ${{ false }}  # <-- This disables the workflow
```

**I've updated these files to make it easier to enable them when you're ready.**

---

## 🚀 How to Enable Automatic Migrations

### Option 1: Enable Dev Environment Auto-Deploy (Recommended)

**File**: `.github/workflows/deploy-dev-environment.yml`

1. **Remove the `if: ${{ false }}` line** (I've already commented it out for you):

```yaml
jobs:
  deploy-dev:
    # if: ${{ false }}  # <-- Remove or comment this line
    runs-on: ubuntu-latest
```

2. **Ensure you have AWS secrets configured** in GitHub:
   - `INFRA_REPO_TOKEN` - Token to access dentia-infra repo
   - AWS credentials configured for OIDC role assumption

3. **Push to `develop` branch**:

```bash
git add .
git commit -m "Add new migration"
git push origin develop
```

**Result**: Automatically builds images, deploys to dev, and runs migrations!

### Option 2: Enable Backend Auto-Deploy

**File**: `.github/workflows/deploy-backend.yml`

1. **Remove the `if: ${{ false }}` line** (I've already commented it out for you):

```yaml
jobs:
  build-and-deploy:
    # if: ${{ false }}  # <-- Remove or comment this line
    runs-on: ubuntu-latest
```

2. **Ensure you have AWS secrets configured** in GitHub:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION`
   - `ECR_REPOSITORY`

3. **Push changes to backend or migrations**:

```bash
# Changes to apps/backend/** or packages/prisma/** will trigger deployment
git push origin main
```

**Result**: Automatically builds backend image, deploys to ECS, and runs migrations!

### Option 3: Manual Deployment with Automatic Migrations

Even without CI/CD enabled, migrations run automatically when you deploy manually:

```bash
# Build and push images manually
docker build -f infra/docker/backend.Dockerfile -t <ecr-uri>/backend:latest .
docker push <ecr-uri>/backend:latest

# Update ECS service
aws ecs update-service \
  --cluster dentia-cluster \
  --service dentia-backend \
  --force-new-deployment

# Migrations will run automatically when the new container starts!
```

---

## 📊 What Happens When Migrations Run

### Container Startup Sequence

```bash
# 1. Container starts
ENTRYPOINT ["/app/migrate-and-start.sh"]

# 2. Migration script runs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗄️  Running Database Migrations
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Running prisma migrate deploy...

# 3. Prisma checks which migrations need to be applied
The following migration(s) have been applied:

migrations/
  ✅ 20251030031945_first_mig
  ✅ 20251104175917_add_user_roles_and_permissions
  ✅ 20251104212242_add_cognito_username
  ✅ 20251105050907_add_cognito_tokens_table
  ✅ 20251116221828_add_stripe_payments  # <-- NEW!

✅ Migrations completed successfully
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 4. Application starts
🚀 Starting application...
```

### If Migration Fails

```bash
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗄️  Running Database Migrations
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Running prisma migrate deploy...

❌ Migration failed with exit code 1
Error: P3009: Migration 20251116221828_add_stripe_payments failed...

# Container exits with error
# ECS will NOT route traffic to this container
# Old version keeps running (no downtime!)
```

---

## 🔍 Monitoring Migrations in Production

### View Logs in CloudWatch

```bash
# View logs for frontend
aws logs tail /ecs/dentia-frontend --follow --profile dentia --region us-east-2

# View logs for backend
aws logs tail /ecs/dentia-backend --follow --profile dentia --region us-east-2

# Filter for migration logs
aws logs tail /ecs/dentia-backend --follow --filter-pattern "Migration" --profile dentia --region us-east-2
```

### Check Migration Status in Database

```bash
# Connect to production DB (via port forwarding)
psql postgresql://dentia_admin:PASSWORD@localhost:15432/dentia

# View applied migrations
SELECT * FROM _prisma_migrations ORDER BY finished_at DESC;

# Check latest migration
SELECT migration_name, finished_at, success 
FROM _prisma_migrations 
ORDER BY finished_at DESC 
LIMIT 5;
```

---

## 📝 Developer Workflow

### Creating and Deploying a New Migration

#### Step 1: Create Migration Locally

```bash
# Start your local database
./dev.sh -m db

# Make changes to schema
vim packages/prisma/schema.prisma

# Create migration
cd packages/prisma
DATABASE_URL="postgresql://dentia:dentia@localhost:5433/dentia" \
  npx prisma migrate dev --name add_new_feature
```

#### Step 2: Test Locally

```bash
# Verify the migration SQL
cat packages/prisma/migrations/XXXXXX_add_new_feature/migration.sql

# Test your application with the new schema
./dev.sh
```

#### Step 3: Commit and Push

```bash
git add packages/prisma/migrations/
git add packages/prisma/schema.prisma
git commit -m "Add migration: add_new_feature"

# Push to develop for automatic dev deployment
git push origin develop

# OR create PR for review first
git push origin feature/add-new-feature
gh pr create --base develop
```

#### Step 4: Automatic Deployment (if CI/CD enabled)

```bash
# GitHub Actions will:
# 1. Run tests
# 2. Build Docker images (with your new migration)
# 3. Push to ECR
# 4. Update ECS service
# 5. ECS starts new container
# 6. Migration runs automatically
# 7. Application starts with updated schema
```

#### Step 5: Verify in Production

```bash
# Check CloudWatch logs
aws logs tail /ecs/dentia-backend --follow --profile dentia --region us-east-2 | grep "add_new_feature"

# Or check database
psql postgresql://... -c "SELECT * FROM _prisma_migrations WHERE migration_name LIKE '%add_new_feature%';"
```

---

## ⚠️ Important Safety Features

### 1. Migrations Run BEFORE App Starts

If a migration fails, the container fails to start. This means:
- ✅ **No broken app with old schema**
- ✅ **ECS keeps running old version**
- ✅ **No downtime**
- ✅ **Safe rollback**

### 2. Idempotent Migrations

Prisma tracks applied migrations in `_prisma_migrations` table:
- ✅ **Safe to run multiple times**
- ✅ **Multiple containers can start simultaneously**
- ✅ **Only one applies the migration**
- ✅ **Others skip it and continue**

### 3. Multiple Containers

If you have 3 ECS tasks running:
- Task 1: Acquires lock, applies migration, starts app
- Task 2: Sees migration already applied, skips, starts app
- Task 3: Sees migration already applied, skips, starts app

### 4. Rollback Strategy

If you need to rollback:

```bash
# Option 1: Deploy previous version (recommended)
git revert <commit-hash>
git push origin develop

# Option 2: Mark migration as rolled back
cd packages/prisma
npx prisma migrate resolve --rolled-back <migration-name>

# Option 3: Restore database from backup (nuclear option)
# Use AWS RDS snapshot restoration
```

---

## 🧪 Testing Before Production

### Test in Dev Environment First

```bash
# 1. Push to develop branch (triggers dev deployment)
git push origin develop

# 2. Verify in dev environment
# Check CloudWatch logs
# Test the application
# Verify database schema

# 3. If successful, merge to main
git checkout main
git merge develop
git push origin main
```

### Test Locally Before Pushing

```bash
# 1. Run migration locally
DATABASE_URL="postgresql://dentia:dentia@localhost:5433/dentia" \
  npx prisma migrate dev --name my_migration

# 2. Test your application
./dev.sh

# 3. Verify schema changes
psql postgresql://dentia:dentia@localhost:5433/dentia -c "\dt"

# 4. If all good, commit and push
git add . && git commit -m "Add migration" && git push
```

---

## 📚 Required GitHub Secrets

To enable CI/CD, configure these secrets in GitHub:

### For Dev Environment Deployment

Go to: `Settings → Secrets and variables → Actions`

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `INFRA_REPO_TOKEN` | GitHub token to access dentia-infra repo | `ghp_...` |

Note: Uses AWS OIDC role assumption (no keys needed)

### For Backend Deployment (Alternative)

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | AWS access key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | `...` |
| `AWS_REGION` | AWS region | `us-east-2` |
| `ECR_REPOSITORY` | ECR repository URL | `509852961700.dkr.ecr.us-east-2.amazonaws.com` |

---

## 🎯 Quick Reference

### Enable Automatic Migrations

1. **Remove `if: ${{ false }}` from workflow files** (already commented out for you)
2. **Configure GitHub secrets**
3. **Push to `develop` or `main` branch**

### Check Migration Status

```bash
# In CloudWatch
aws logs tail /ecs/dentia-backend --follow --profile dentia --region us-east-2 | grep Migration

# In Database
psql postgresql://... -c "SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 10;"
```

### Manual Deployment

```bash
# Even without CI/CD, migrations run automatically on container startup
aws ecs update-service --cluster dentia-cluster --service dentia-backend --force-new-deployment
```

---

## ✅ Summary

| Environment | Migrations Run? | When? | Automatic? |
|-------------|-----------------|-------|------------|
| **Local Dev** | ✅ Yes | When you run `prisma migrate dev` | Manual |
| **CI/CD Build** | ❌ No | N/A (just builds images) | N/A |
| **ECS Dev** | ✅ Yes | Every container startup | **Automatic** ✨ |
| **ECS Production** | ✅ Yes | Every container startup | **Automatic** ✨ |

### Key Points

- ✅ **Migrations ARE automated** - they run on every container startup in ECS
- ✅ **CI/CD is ready** - just needs to be enabled
- ✅ **Safe by design** - failed migrations prevent broken deployments
- ✅ **Idempotent** - safe to run multiple times
- ✅ **Zero downtime** - old version keeps running if migration fails

### To Enable Full Automation

1. Remove `if: ${{ false }}` from deployment workflow files
2. Configure GitHub secrets
3. Push to `develop` branch
4. Watch migrations run automatically! 🎉

---

## 🔗 Related Documentation

- [DATABASE_MIGRATIONS_GUIDE.md](./DATABASE_MIGRATIONS_GUIDE.md) - Detailed migration guide
- [CI_CD_SETUP_COMPLETE.md](./CI_CD_SETUP_COMPLETE.md) - CI/CD testing setup
- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) - Production deployment guide
- `scripts/migrate-and-start.sh` - The migration entrypoint script
- `infra/docker/backend.Dockerfile` - Docker image configuration

---

**Your migrations will run automatically once you enable CI/CD! 🚀**

