# Dev Environment Deployment Guide

## 🎯 Overview

Your project has **manual dev environment deployment** workflows that allow you to:
- ✅ Spin up a complete dev environment in AWS
- ✅ Deploy when YOU decide (not automatic on push)
- ✅ Destroy the environment when done (save costs)

---

## ⚙️ Current Configuration

### Dev Environment Workflows

| Workflow | Trigger | What It Does | Status |
|----------|---------|--------------|--------|
| **deploy-dev-environment.yml** | 🔘 Manual (`workflow_dispatch`)<br>📝 Push to `develop` (disabled) | Builds images, deploys to AWS dev environment via Terraform | ⏸️ Disabled |
| **destroy-dev-environment.yml** | 🔘 Manual only | Destroys dev environment, cleans up all resources | ⏸️ Disabled |

### Key Points

1. **NOT automatic on push** ✅ - Push to `develop` won't trigger deployment automatically
2. **Manual trigger via GitHub UI** - You control when to deploy
3. **Both workflows have `if: ${{ false }}`** - Disabled for safety during setup
4. **Uses Terraform** - Provisions complete infrastructure in AWS

---

## 🚀 How to Deploy Dev Environment

### Option 1: Via GitHub Actions UI (Recommended)

#### Step 1: Enable the Workflows

First, enable the workflows by removing the `if: ${{ false }}` line:

**File**: `.github/workflows/deploy-dev-environment.yml`
```yaml
jobs:
  deploy-dev:
    # if: ${{ false }}  # <-- Remove or comment this line
    runs-on: ubuntu-latest
```

**File**: `.github/workflows/destroy-dev-environment.yml`
```yaml
jobs:
  destroy-dev:
    # if: ${{ false }}  # <-- Remove or comment this line
    runs-on: ubuntu-latest
```

#### Step 2: Configure GitHub Secrets

Go to: `Settings → Secrets and variables → Actions`

Add this secret:
| Secret Name | Description | Example |
|-------------|-------------|---------|
| `INFRA_REPO_TOKEN` | Personal access token to access `shaunk/dentia-infra` | `ghp_xxxx...` |
| `STRIPE_PUBLISHABLE_KEY_DEV` | Stripe publishable key for dev environment | `pk_test_...` |

**Note**: The workflow uses AWS OIDC role assumption, so no AWS keys needed.

#### Step 3: Deploy Dev Environment

1. Go to your GitHub repository
2. Click **Actions** tab
3. Click **Deploy Dev Environment** workflow
4. Click **Run workflow** dropdown
5. Select `develop` branch
6. Click **Run workflow** button

```
GitHub → Actions → Deploy Dev Environment → Run workflow
```

#### Step 4: Watch Progress

The workflow will:
1. ✅ Build frontend image (includes migrations)
2. ✅ Build backend image (includes migrations)
3. ✅ Push images to ECR
4. ✅ Run Terraform to provision dev environment
5. ✅ Deploy containers (migrations run automatically)

**Duration**: ~10-15 minutes

#### Step 5: Access Dev Environment

Once complete, your dev environment will be available at:
- **Frontend**: `https://dev.dentiaapp.com`
- **Backend**: `https://api-dev.dentiaapp.com`

---

### Option 2: Via GitHub CLI (For Automation/Scripts)

```bash
# Trigger deploy-dev-environment workflow
gh workflow run deploy-dev-environment.yml \
  --ref develop \
  -R shaunk/dentia

# Watch the workflow run
gh run watch
```

---

### Option 3: Local Terraform (Advanced)

If you want to run Terraform locally:

```bash
# Navigate to infra repo
cd /Users/shaunk/Projects/Dentia/dentia-infra/infra/environments/dev

# Initialize Terraform
terraform init -backend-config=backend-prod.tf

# Select or create dev workspace
terraform workspace select dev || terraform workspace new dev

# Plan the deployment
terraform plan -var="environment=dev" -var="frontend_image_tag=dev" -var="backend_image_tag=dev"

# Apply the deployment
terraform apply -var="environment=dev" -var="frontend_image_tag=dev" -var="backend_image_tag=dev"
```

**Note**: This requires having Docker images already pushed to ECR.

---

## 🧹 How to Destroy Dev Environment

### Via GitHub Actions UI

1. Go to **Actions** tab
2. Click **Destroy Dev Environment** workflow
3. Click **Run workflow** dropdown
4. Select `develop` branch
5. Click **Run workflow** button

### Via GitHub CLI

```bash
gh workflow run destroy-dev-environment.yml \
  --ref develop \
  -R shaunk/dentia

gh run watch
```

### Via Local Terraform

```bash
cd /Users/shaunk/Projects/Dentia/dentia-infra/infra/environments/dev

terraform workspace select dev
terraform destroy -var="environment=dev"
```

---

## 🔒 Why It's Not Automatic

Your configuration is **intentionally manual** for these reasons:

### Current Configuration

```yaml
# deploy-dev-environment.yml
on:
  push:
    branches:
      - develop  # <-- This WILL trigger on push to develop
  workflow_dispatch:  # <-- ALSO allows manual trigger

jobs:
  deploy-dev:
    if: ${{ false }}  # <-- But this DISABLES the entire job
```

### What This Means

| Scenario | Will It Deploy? | Reason |
|----------|----------------|--------|
| Push to `develop` | ❌ No | `if: ${{ false }}` blocks the job |
| Manual trigger via GitHub UI | ❌ No | `if: ${{ false }}` blocks the job |
| Push to `develop` (after removing `if: false`) | ✅ Yes | Workflow will run automatically |
| Manual trigger (after removing `if: false`) | ✅ Yes | Workflow will run on demand |

### To Make It Manual-Only

If you want it to ONLY run manually (never on push):

```yaml
# deploy-dev-environment.yml
on:
  # push:  # <-- Comment this out completely
  #   branches:
  #     - develop
  workflow_dispatch:  # <-- Keep this for manual trigger only
```

---

## 📊 What Gets Deployed

When you deploy the dev environment, Terraform creates:

### Infrastructure Components

```
Dev Environment (dev.dentiaapp.com)
├── 🌐 VPC & Networking
│   ├── Public subnets (2 AZs)
│   ├── Private subnets (2 AZs)
│   ├── NAT Gateway
│   └── Internet Gateway
│
├── 🗄️ Aurora PostgreSQL Cluster
│   ├── Writer instance
│   ├── Reader instance (optional)
│   └── Private subnet access only
│
├── 📦 ECS Cluster
│   ├── Frontend service (2 tasks)
│   ├── Backend service (2 tasks)
│   └── Auto-scaling enabled
│
├── 🔀 Application Load Balancer
│   ├── Frontend target group
│   ├── Backend target group
│   └── Health checks
│
├── 🌍 CloudFront + WAF
│   ├── CDN distribution
│   ├── SSL/TLS certificates
│   └── Security rules
│
├── 🪣 S3 Buckets
│   ├── Static assets
│   └── User uploads
│
└── 🔐 Security
    ├── Security groups
    ├── IAM roles
    └── Bastion host
```

### Cost Considerations

**Estimated Monthly Cost** (if left running 24/7):
- Aurora Serverless: ~$50-100/month
- ECS Tasks: ~$30-50/month
- ALB: ~$20/month
- NAT Gateway: ~$30/month
- CloudFront: ~$5-10/month
- **Total**: ~$135-210/month

💡 **Save Money**: Destroy the dev environment when not in use!

---

## 🔄 Typical Workflow

### Development Cycle

```bash
# 1. Work on features locally
git checkout -b feature/new-feature
# ... make changes ...

# 2. Push to feature branch
git push origin feature/new-feature

# 3. Create PR to develop
gh pr create --base develop

# 4. After PR review and merge to develop
# (NO automatic deployment - you control when)

# 5. When ready to test in cloud, manually trigger deployment
# Go to GitHub Actions → Deploy Dev Environment → Run workflow

# 6. Test in dev environment
# Visit: https://dev.dentiaapp.com

# 7. Done testing? Destroy to save costs
# Go to GitHub Actions → Destroy Dev Environment → Run workflow
```

### Testing Migrations in Dev

```bash
# 1. Create migration locally
cd packages/prisma
npx prisma migrate dev --name add_feature

# 2. Test locally
./dev.sh

# 3. Commit and push
git add packages/prisma/migrations/
git commit -m "Add migration: add_feature"
git push origin develop

# 4. Deploy dev environment (manual)
# GitHub Actions → Deploy Dev Environment → Run workflow

# 5. Watch migrations run in CloudWatch
aws logs tail /ecs/dentia-dev-backend --follow --profile dentia --region us-east-2

# 6. Verify in dev
# Test your feature at https://dev.dentiaapp.com

# 7. If all good, merge to main for production
git checkout main
git merge develop
git push origin main
```

---

## 📋 Workflow Details

### Deploy Dev Environment

**File**: `.github/workflows/deploy-dev-environment.yml`

**What it does**:
1. Checks out your code
2. Checks out `dentia-infra` repository
3. Configures AWS credentials (OIDC role)
4. Builds frontend Docker image
5. Builds backend Docker image
6. Pushes images to ECR with `dev` tag
7. Runs Terraform to provision/update dev environment
8. ECS starts containers → Migrations run automatically

**Environment Variables**:
- `AWS_REGION`: us-east-2
- `ENVIRONMENT`: dev
- `ECR_ACCOUNT`: 509852961700.dkr.ecr.us-east-2.amazonaws.com
- `FRONTEND_IMAGE`: dentia-frontend
- `BACKEND_IMAGE`: dentia-backend

### Destroy Dev Environment

**File**: `.github/workflows/destroy-dev-environment.yml`

**What it does**:
1. Checks out infrastructure code
2. Configures AWS credentials
3. Runs `terraform destroy` to remove all resources
4. Cleans up ECR images (optional)

**⚠️ Warning**: This will delete:
- All ECS services and tasks
- Aurora database (and all data!)
- Load balancers
- S3 buckets (if not configured with deletion protection)
- All other AWS resources in the dev environment

---

## 🛡️ Safety Features

### Concurrency Control

```yaml
concurrency:
  group: dev-environment
  cancel-in-progress: false
```

This ensures:
- Only one deploy/destroy runs at a time
- If you trigger another deployment while one is running, it waits
- Prevents race conditions and resource conflicts

### Manual Approval (Optional)

You can add a manual approval step:

```yaml
jobs:
  deploy-dev:
    runs-on: ubuntu-latest
    environment:
      name: dev
      url: https://dev.dentiaapp.com
    # ... rest of the workflow
```

Then in GitHub Settings → Environments → dev:
- ☑️ Required reviewers
- Select team members who can approve

Now deployments require manual approval before running!

---

## 🔍 Monitoring Deployments

### View Workflow Status

```bash
# List recent workflow runs
gh run list --workflow=deploy-dev-environment.yml

# View specific run
gh run view <run-id>

# Watch a running workflow
gh run watch
```

### View CloudWatch Logs

```bash
# Backend logs
aws logs tail /ecs/dentia-dev-backend --follow --profile dentia --region us-east-2

# Frontend logs
aws logs tail /ecs/dentia-dev-frontend --follow --profile dentia --region us-east-2

# Filter for migrations
aws logs tail /ecs/dentia-dev-backend --follow --filter-pattern "Migration" --profile dentia --region us-east-2
```

### Check ECS Service Status

```bash
# List services
aws ecs list-services --cluster dentia-dev-cluster --profile dentia --region us-east-2

# Describe service
aws ecs describe-services \
  --cluster dentia-dev-cluster \
  --services dentia-dev-backend \
  --profile dentia \
  --region us-east-2
```

---

## ❓ FAQ

### Q: Will pushing to `develop` automatically deploy?

**A**: No, not currently. The workflow has `if: ${{ false }}` which disables it. Even though the trigger says `push: branches: [develop]`, the job won't run.

### Q: How do I make it automatic?

**A**: Remove the `if: ${{ false }}` line from `deploy-dev-environment.yml`. Then every push to `develop` will trigger a deployment.

### Q: How do I make it manual-only?

**A**: Keep `if: ${{ false }}` removed, but comment out the `push:` trigger. Keep only `workflow_dispatch:`.

### Q: How much does dev environment cost?

**A**: ~$135-210/month if running 24/7. Save money by destroying when not in use!

### Q: Do migrations run automatically?

**A**: Yes! When ECS starts your containers, the `migrate-and-start.sh` script runs migrations before starting the app.

### Q: What if migrations fail?

**A**: The container won't start, and ECS will keep the old version running (no downtime). Check CloudWatch logs for errors.

### Q: Can I deploy without Terraform?

**A**: Not recommended. Terraform manages all infrastructure as code. Manual changes will be overwritten on next deployment.

### Q: How do I update just the code without rebuilding infrastructure?

**A**: The workflow is smart - Terraform only changes what's different. If infrastructure is unchanged, it just updates the ECS service with new images.

---

## 🎯 Quick Reference

### Enable Manual Deployment

```yaml
# File: .github/workflows/deploy-dev-environment.yml
on:
  workflow_dispatch:  # Manual trigger only

jobs:
  deploy-dev:
    # Remove the 'if: ${{ false }}' line
    runs-on: ubuntu-latest
```

### Enable Automatic Deployment on Push

```yaml
# File: .github/workflows/deploy-dev-environment.yml
on:
  push:
    branches:
      - develop
  workflow_dispatch:

jobs:
  deploy-dev:
    # Remove the 'if: ${{ false }}' line
    runs-on: ubuntu-latest
```

### Commands

```bash
# Deploy via CLI
gh workflow run deploy-dev-environment.yml --ref develop

# Destroy via CLI
gh workflow run destroy-dev-environment.yml --ref develop

# Watch logs
gh run watch

# View CloudWatch logs
aws logs tail /ecs/dentia-dev-backend --follow --profile dentia --region us-east-2
```

---

## 📚 Related Documentation

- [AUTO_MIGRATION_SETUP.md](./AUTO_MIGRATION_SETUP.md) - How automatic migrations work
- [PRODUCTION_MIGRATION_DEPLOY.md](./PRODUCTION_MIGRATION_DEPLOY.md) - Deploying migrations to production
- [CI_CD_SETUP_COMPLETE.md](./CI_CD_SETUP_COMPLETE.md) - CI/CD testing setup
- [LOCAL_DEV_GUIDE.md](./LOCAL_DEV_GUIDE.md) - Local development guide

---

## ✅ Summary

| Question | Answer |
|----------|--------|
| **Does push to develop auto-deploy?** | ❌ No - workflows are disabled with `if: ${{ false }}` |
| **Can I deploy manually?** | ✅ Yes - via GitHub Actions UI or CLI |
| **Are there scripts to spin up/destroy?** | ✅ Yes - `deploy-dev-environment.yml` and `destroy-dev-environment.yml` |
| **Do migrations run automatically?** | ✅ Yes - when containers start in ECS |
| **How to enable it?** | Remove `if: ${{ false }}` from workflow files |
| **Cost if left running?** | ~$135-210/month |
| **Recommendation** | Keep manual, destroy when not in use |

**Your dev environment is configured for manual deployment via GitHub Actions workflows! 🎯**

