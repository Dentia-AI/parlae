# 🚀 Deployment & Migration Complete Guide

## Quick Answers to Your Questions

### ❓ "Can't reach production database for migrations?"

✅ **Solution**: Use the bastion host with port forwarding

```bash
# Terminal 1: Start port forwarding
./scripts/connect-production-db.sh

# Terminal 2: Deploy migrations
./scripts/deploy-production-migrations-via-bastion.sh
```

**Why**: Your Aurora database is in a private VPC (secure!) and not directly accessible from your local machine.

---

### ❓ "Does pushing to develop automatically spin up dev environment?"

✅ **Answer**: **NO** - It's currently **disabled** (by design)

Your workflows have:
```yaml
if: ${{ false }}  # Disables the workflow
```

**To deploy manually**:
1. Go to GitHub → Actions tab
2. Click "Deploy Dev Environment" workflow
3. Click "Run workflow" → Select `develop` branch → Run

**This is good!** You control when to deploy (and when to destroy to save money).

---

### ❓ "Are there scripts to spin up/destroy using Terraform?"

✅ **Yes!** Two GitHub Actions workflows:

| Workflow | What It Does | Trigger |
|----------|--------------|---------|
| `deploy-dev-environment.yml` | Spins up complete dev environment | Manual (GitHub UI) |
| `destroy-dev-environment.yml` | Tears down everything | Manual (GitHub UI) |

**Both are currently disabled** but ready to use. See [DEV_ENVIRONMENT_DEPLOYMENT.md](./docs/DEV_ENVIRONMENT_DEPLOYMENT.md) for details.

---

## 📊 Complete System Overview

### How Migrations Work Across Environments

```
┌─────────────────────────────────────────────────────────────┐
│ LOCAL DEVELOPMENT                                            │
├─────────────────────────────────────────────────────────────┤
│ 1. Create migration:                                         │
│    npx prisma migrate dev --name add_feature                │
│                                                              │
│ 2. Applied automatically to local PostgreSQL                │
│    (localhost:5433)                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ git push
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ GITHUB (CI/CD)                                               │
├─────────────────────────────────────────────────────────────┤
│ • Runs tests (✅ enabled)                                   │
│ • Builds Docker images (migrations included)                │
│ • Pushes to ECR                                             │
│ • Does NOT run migrations (DB is in VPC)                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Manual trigger
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ DEV ENVIRONMENT (AWS)                                        │
├─────────────────────────────────────────────────────────────┤
│ Deploy Workflow (Manual):                                   │
│   1. Terraform provisions infrastructure                    │
│   2. ECS starts containers                                  │
│   3. 🎯 Migrations run AUTOMATICALLY on container startup   │
│   4. App starts                                             │
│                                                              │
│ Cost: ~$135-210/month if left running                       │
│ 💡 Destroy when not in use to save money                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Manual trigger or auto (if enabled)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ PRODUCTION (AWS)                                             │
├─────────────────────────────────────────────────────────────┤
│ Option 1 - Via Bastion (for migration-only deploys):       │
│   ./scripts/connect-production-db.sh                        │
│   ./scripts/deploy-production-migrations-via-bastion.sh     │
│                                                              │
│ Option 2 - Via ECS (normal deployments):                   │
│   • Deploy new Docker images                                │
│   • ECS starts containers                                   │
│   • 🎯 Migrations run AUTOMATICALLY on container startup   │
│   • App starts                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📚 Documentation Structure

I've created comprehensive documentation for you:

### Core Guides

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **[DEPLOYMENT_MIGRATION_SUMMARY.md](./DEPLOYMENT_MIGRATION_SUMMARY.md)** | 👈 You are here - Quick overview | Start here |
| **[AUTO_MIGRATION_SETUP.md](./docs/AUTO_MIGRATION_SETUP.md)** | How automatic migrations work in ECS | Understanding the system |
| **[PRODUCTION_MIGRATION_DEPLOY.md](./docs/PRODUCTION_MIGRATION_DEPLOY.md)** | How to deploy migrations to production | When deploying to prod |
| **[DEV_ENVIRONMENT_DEPLOYMENT.md](./docs/DEV_ENVIRONMENT_DEPLOYMENT.md)** | How to spin up/down dev environment | When testing in AWS |
| **[DATABASE_MIGRATIONS_GUIDE.md](./docs/DATABASE_MIGRATIONS_GUIDE.md)** | Complete migration reference | Detailed migration info |

### Existing Guides

| Document | Purpose |
|----------|---------|
| [LOCAL_DEV_GUIDE.md](./docs/LOCAL_DEV_GUIDE.md) | Local development setup |
| [CI_CD_SETUP_COMPLETE.md](./docs/CI_CD_SETUP_COMPLETE.md) | CI/CD testing setup |
| [STRIPE_INTEGRATION_GUIDE.md](./STRIPE_INTEGRATION_GUIDE.md) | Stripe integration |

---

## 🎯 Common Workflows

### 1. Local Development (Daily)

```bash
# Start local database
./dev.sh -m db

# Make schema changes
vim packages/prisma/schema.prisma

# Create migration
cd packages/prisma
DATABASE_URL="postgresql://dentia:dentia@localhost:5433/dentia" \
  npx prisma migrate dev --name add_feature

# Test locally
cd ../..
./dev.sh

# Commit when ready
git add packages/prisma/
git commit -m "Add migration: add_feature"
git push origin feature/add-feature
```

### 2. Deploy to Production (Manual Migration)

```bash
# Terminal 1: Connect to production DB via bastion
./scripts/connect-production-db.sh

# Terminal 2: Deploy migrations
./scripts/deploy-production-migrations-via-bastion.sh
```

**Output**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗄️  Deploy Production Migrations via Bastion
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Port forwarding is active
✅ DATABASE_URL fetched from SSM

Running: npx prisma migrate deploy

The following migration(s) have been applied:
  ✅ 20251116221828_add_stripe_payments

✅ Migrations completed successfully!
```

### 3. Deploy to Production (via ECS - Automatic Migrations)

```bash
# 1. Commit your changes
git add .
git commit -m "Add Stripe payments"
git push origin main

# 2. Build and push images
aws ecr get-login-password --region us-east-2 --profile dentia | \
  docker login --username AWS --password-stdin 509852961700.dkr.ecr.us-east-2.amazonaws.com

docker build -f infra/docker/backend.Dockerfile -t 509852961700.dkr.ecr.us-east-2.amazonaws.com/dentia-backend:latest .
docker push 509852961700.dkr.ecr.us-east-2.amazonaws.com/dentia-backend:latest

# 3. Update ECS service (migrations run automatically!)
aws ecs update-service \
  --cluster dentia-cluster \
  --service dentia-backend \
  --force-new-deployment \
  --profile dentia \
  --region us-east-2

# 4. Watch migrations happen
aws logs tail /ecs/dentia-backend --follow --profile dentia --region us-east-2
```

### 4. Deploy Dev Environment

```bash
# Option 1: Via GitHub UI (Recommended)
# 1. Go to GitHub → Actions tab
# 2. Click "Deploy Dev Environment"
# 3. Click "Run workflow" → Select develop → Run
# 4. Wait ~10-15 minutes
# 5. Access at https://dev.dentiaapp.com

# Option 2: Via GitHub CLI
gh workflow run deploy-dev-environment.yml --ref develop
gh run watch
```

### 5. Destroy Dev Environment (Save Money!)

```bash
# Via GitHub UI
# 1. Go to GitHub → Actions tab
# 2. Click "Destroy Dev Environment"
# 3. Click "Run workflow" → Run

# Via GitHub CLI
gh workflow run destroy-dev-environment.yml --ref develop
```

---

## 🛠️ New Scripts Created

I created these helper scripts for you:

### Production Database Access

```bash
# Connect to production DB via bastion (keeps connection open)
./scripts/connect-production-db.sh

# Deploy migrations to production via bastion
./scripts/deploy-production-migrations-via-bastion.sh
```

### What They Do

**`connect-production-db.sh`**:
- Finds bastion instance
- Establishes SSM port forwarding session
- Maps production Aurora → localhost:15432
- Keeps connection alive (leave terminal open)

**`deploy-production-migrations-via-bastion.sh`**:
- Checks if port forwarding is active
- Fetches DATABASE_URL from AWS SSM
- Replaces Aurora hostname with localhost
- Runs `prisma migrate deploy`
- Shows migration status

---

## 🔐 Security & Best Practices

### ✅ What You're Doing Right

1. **Aurora in Private VPC** - Database not publicly accessible
2. **Bastion Host** - Secure access via AWS Systems Manager
3. **Manual Dev Deployment** - You control when (and costs)
4. **Migrations Before App Start** - Failed migrations prevent broken deployments
5. **Idempotent Migrations** - Safe to run multiple times

### 🎯 Recommendations

#### For Development
- ✅ Use local dev environment for daily work (`./dev.sh`)
- ✅ Deploy dev environment only when testing in AWS
- ✅ Destroy dev environment when done (saves ~$150/month)

#### For Migrations
- ✅ Test migrations locally first
- ✅ For production:
  - **Normal deployments**: Let ECS run migrations automatically
  - **Migration-only updates**: Use bastion scripts
- ✅ Always check CloudWatch logs after deployment

#### For CI/CD
- ✅ Tests are enabled and run on every push (good!)
- ✅ Deployments are manual (good for now)
- 🎯 When ready, enable automatic deployments:
  - Remove `if: ${{ false }}` from workflow files
  - Add branch protection rules
  - Require tests to pass before deploy

---

## 📊 Cost Management

### Environments

| Environment | Status | Monthly Cost | Notes |
|-------------|--------|--------------|-------|
| **Local** | Running | $0 | Docker on your machine |
| **Dev** | On-demand | ~$135-210 | Destroy when not in use! |
| **Production** | Always on | ~$300-500 | Full infrastructure |

### Tips to Save Money

1. **Destroy dev environment** when not actively testing:
   ```bash
   gh workflow run destroy-dev-environment.yml --ref develop
   ```

2. **Use Aurora Serverless v2** (already configured):
   - Scales to zero when idle
   - Pay only for actual usage

3. **Monitor costs** with AWS Cost Explorer:
   - Tag resources with environment
   - Set up billing alerts
   - Review monthly

---

## 🐛 Troubleshooting

### "Can't reach database server"

**Problem**: Trying to access Aurora from local machine

**Solutions**:
1. Use bastion: `./scripts/connect-production-db.sh`
2. Or deploy via ECS (migrations run automatically)

### "Port 15432 not listening"

**Problem**: Port forwarding not active

**Solution**:
```bash
# Check if bastion session is running
lsof -i :15432

# If not, start it in another terminal
./scripts/connect-production-db.sh
```

### "Session Manager plugin not found"

**Solution**:
```bash
# macOS
brew install --cask session-manager-plugin

# Verify
session-manager-plugin --version
```

### "Migration failed in ECS"

**Problem**: Container keeps restarting

**Solution**:
```bash
# Check CloudWatch logs
aws logs tail /ecs/dentia-backend --follow --profile dentia --region us-east-2

# Look for migration errors
aws logs tail /ecs/dentia-backend --filter-pattern "Migration" --profile dentia --region us-east-2
```

### Dev environment won't deploy

**Problem**: GitHub Actions workflow disabled

**Solution**: Remove `if: ${{ false }}` from workflow file

---

## ✅ Current Status Summary

### What's Working ✅

- ✅ Local development environment
- ✅ Prisma migrations created locally
- ✅ Tests run on every push to GitHub
- ✅ Docker images include migrations
- ✅ ECS containers run migrations automatically
- ✅ Bastion host configured for secure DB access
- ✅ Helper scripts created for production access

### What's Disabled (Intentionally) ⏸️

- ⏸️ Automatic deployment on push (manual only)
- ⏸️ Dev environment auto-spin up (manual only)

### What You Need to Enable (When Ready) 🎯

1. **Remove `if: ${{ false }}`** from deployment workflows
2. **Configure GitHub secrets**:
   - `INFRA_REPO_TOKEN`
   - `STRIPE_PUBLISHABLE_KEY_DEV`
3. **Optionally enable automatic deployments** (or keep manual)

---

## 🚀 Next Steps

### Immediate (Today)

1. ✅ **Deploy your Stripe migration to production**:
   ```bash
   # Terminal 1
   ./scripts/connect-production-db.sh
   
   # Terminal 2
   ./scripts/deploy-production-migrations-via-bastion.sh
   ```

2. ✅ **Verify in production**:
   ```bash
   # Check tables exist
   psql postgresql://...@localhost:15432/dentia -c "\dt"
   ```

### Short Term (This Week)

1. **Test dev environment deployment**:
   - Remove `if: ${{ false }}` from `deploy-dev-environment.yml`
   - Trigger manually via GitHub Actions
   - Test your app at https://dev.dentiaapp.com
   - Destroy when done

2. **Review and enable CI/CD** (optional):
   - Keep manual for now, or
   - Enable automatic deployments for faster iteration

### Long Term

1. **Set up monitoring**:
   - CloudWatch dashboards
   - Alerts for failed migrations
   - Cost alerts

2. **Automate more**:
   - Automatic dev deployments on develop branch
   - Automatic prod deployments on main branch
   - Blue/green deployments

---

## 📞 Quick Reference

### Access Points

| Environment | Frontend | Backend | Database |
|-------------|----------|---------|----------|
| **Local** | http://localhost:3000 | http://localhost:4001 | localhost:5433 |
| **Dev** | https://dev.dentiaapp.com | https://api-dev.dentiaapp.com | Via bastion |
| **Production** | https://dentiaapp.com | https://api.dentiaapp.com | Via bastion |

### Key Commands

```bash
# Local dev
./dev.sh                      # Start everything
./dev.sh -m db                # Start just database

# Production migrations
./scripts/connect-production-db.sh                    # Terminal 1
./scripts/deploy-production-migrations-via-bastion.sh # Terminal 2

# Dev environment
gh workflow run deploy-dev-environment.yml --ref develop   # Deploy
gh workflow run destroy-dev-environment.yml --ref develop  # Destroy

# Monitoring
aws logs tail /ecs/dentia-backend --follow --profile dentia --region us-east-2
```

---

## 📚 Documentation Index

### Quick Start Guides
- 👉 [This Document](./DEPLOYMENT_MIGRATION_SUMMARY.md) - Complete overview
- [LOCAL_DEV_GUIDE.md](./docs/LOCAL_DEV_GUIDE.md) - Local development

### Deployment Guides
- [PRODUCTION_MIGRATION_DEPLOY.md](./docs/PRODUCTION_MIGRATION_DEPLOY.md) - Deploy to production
- [DEV_ENVIRONMENT_DEPLOYMENT.md](./docs/DEV_ENVIRONMENT_DEPLOYMENT.md) - Dev environment

### Technical References
- [AUTO_MIGRATION_SETUP.md](./docs/AUTO_MIGRATION_SETUP.md) - How migrations work
- [DATABASE_MIGRATIONS_GUIDE.md](./docs/DATABASE_MIGRATIONS_GUIDE.md) - Migration details
- [CI_CD_SETUP_COMPLETE.md](./docs/CI_CD_SETUP_COMPLETE.md) - CI/CD setup

### Feature Guides
- [STRIPE_INTEGRATION_GUIDE.md](./STRIPE_INTEGRATION_GUIDE.md) - Stripe integration
- [STRIPE_TESTING_GUIDE.md](./STRIPE_TESTING_GUIDE.md) - Testing Stripe

---

## 🎉 Summary

✅ **Your migrations are ready to deploy!**

- Local: Already applied ✅
- Production: Use `./scripts/deploy-production-migrations-via-bastion.sh`
- Dev: Deploy environment manually when needed

✅ **Your CI/CD is configured!**

- Tests run automatically on every push ✅
- Deployments are manual (by design) ✅
- Enable when you're ready ✅

✅ **You have full control!**

- Decide when to deploy dev environment
- Decide when to destroy (save money)
- Migrations run automatically in ECS
- Secure access via bastion host

**Everything is set up and ready to use! 🚀**

